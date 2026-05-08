import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { PostHog } from "posthog-node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Helper: safely parse JSON from Claude response (may include markdown fences)
// ---------------------------------------------------------------------------
function safeParseJSON(text: string | null | undefined) {
  if (!text) return {};
  try {
    const cleanText = text.replace(/^```json\s*/im, "").replace(/```\s*$/im, "");
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to parse JSON response:", text);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Helper: extract text from an Anthropic response
// ---------------------------------------------------------------------------
function extractText(response: Anthropic.Message): string {
  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

// ---------------------------------------------------------------------------
// Initialise Sentry
// ---------------------------------------------------------------------------
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
  });
}

// ---------------------------------------------------------------------------
// Initialise PostHog
// ---------------------------------------------------------------------------
const posthog =
  process.env.POSTHOG_API_KEY && process.env.POSTHOG_HOST
    ? new PostHog(process.env.POSTHOG_API_KEY, {
        host: process.env.POSTHOG_HOST,
      })
    : null;

// ---------------------------------------------------------------------------
// Main server
// ---------------------------------------------------------------------------
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // ── Claude client ──────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY environment variable is not set.");
  }

  const anthropic = new Anthropic({ apiKey: apiKey ?? "" });

  // Model to use across all endpoints
  const MODEL = "claude-sonnet-4-6";

  // System prompt that enforces JSON-only responses
  const JSON_SYSTEM =
    "You are a helpful assistant. Respond ONLY with valid JSON. " +
    "Do not include markdown code fences, explanations, or any text outside the JSON.";

  // ── Endpoint 1: generate-initial-analysis ──────────────────────────────────
  app.post("/api/generate-initial-analysis", async (req, res) => {
    const { subjects } = req.body;
    if (!subjects || !Array.isArray(subjects)) {
      return res.status(400).json({ error: "Subjects array is required" });
    }

    const prompt = `
You are an expert UK university admissions and careers advisor for GCSE students (age 14-15).
Analyze the A-level subject combination: ${subjects.join(", ")}.

Your response must be grounded in official, authoritative UK sources like the Russell Group's 'Informed Choices' guide, UCAS, HESA, and OfQual data.

CRITICAL INSTRUCTION: Your analysis must first identify the most common university degree categories these subjects lead to (e.g., 'STEM & Engineering', 'Humanities & Social Sciences', 'Creative Arts', 'Business & Economics'). Then, for each career you suggest, you MUST populate the 'degreePathways' field with the relevant categories. This creates a clear pathway from A-levels to degree to career.

CRITICAL INSTRUCTION: Ensure the suggested careers represent a diverse mix of options. If the subject combination is a strong prerequisite for specific vocational or competitive professional degrees (e.g., Dentistry, Veterinary Medicine, Architecture, Allied Health Professions), you MUST include them alongside broader academic fields. Do not just list generic options. Provide 8 to 10 diverse careers.

CRITICAL INSTRUCTION: In the 'body' of the story, provide a detailed analysis of how each of the chosen subjects interacts with the others. Explain the unique ways they complement each other, how they can be applied together in real-world scenarios, and how they collectively build a powerful, versatile skill set for the student.

Provide a detailed, inspirational, and accurate analysis.
Correct any subject name typos to their standard A-level names.
Return your response as a JSON object with this exact structure:
{
  "futureStory": {
    "introduction": "string",
    "body": "string",
    "conclusion": "string"
  },
  "popularCareers": [
    {
      "careerName": "string",
      "summary": "string",
      "degreePathways": ["string"],
      "companies": ["string"]
    }
  ],
  "earningPotential": {
    "summary": "string",
    "careerSpecifics": [
      { "careerName": "string", "earningInfo": "string" }
    ],
    "outlook": "string"
  }
}
Ensure all markdown string fields are formatted for readability with paragraphs, bold text for emphasis on skills and figures, and lists where appropriate.
`;

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: JSON_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      res.json(safeParseJSON(extractText(response)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate analysis" });
    }
  });

  // ── Endpoint 2: generate-career-requirements ───────────────────────────────
  app.post("/api/generate-career-requirements", async (req, res) => {
    const { jobTitle } = req.body;
    if (!jobTitle) {
      return res.status(400).json({ error: "Job title is required" });
    }

    const COMMON_A_LEVEL_SUBJECTS = [
      "Mathematics",
      "Further Mathematics",
      "Physics",
      "Chemistry",
      "Biology",
      "Computer Science",
      "English Literature",
      "English Language",
      "History",
      "Geography",
      "Economics",
      "Psychology",
      "Sociology",
      "Religious Studies",
      "Philosophy",
      "Art and Design",
      "Music",
      "Drama",
      "French",
      "German",
      "Spanish",
      "Business Studies",
      "Accounting",
      "Politics",
    ];

    const prompt = `
You are an expert UK careers advisor.
For the job title: "${jobTitle}", identify:
1. Typical UK A-level subjects required or highly recommended. ONLY include standard UK A-level subjects from this list: ${COMMON_A_LEVEL_SUBJECTS.join(", ")}. DO NOT include non-A-level subjects like Statistics, Programming, or general skills.
2. Typical university degree pathways.
3. A brief explanation of the relevance.

Return your response as a JSON object with this exact structure:
{
  "aLevelSubjects": ["string"],
  "universityCourses": ["string"],
  "explanation": "string"
}
`;

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: JSON_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      res.json(safeParseJSON(extractText(response)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate career requirements" });
    }
  });

  // ── Endpoint 3: generate-builder-courses ───────────────────────────────────
  app.post("/api/generate-builder-courses", async (req, res) => {
    const { major, minors, targetUniversities } = req.body;

    const uniFilter =
      targetUniversities && targetUniversities.length > 0
        ? `Prioritize searching for courses at these specific universities: ${targetUniversities.join(", ")}. If courses are available at these universities, include them first. `
        : "";

    const prompt = `
You are an expert UK university admissions advisor.
A student wants to study a combination of "${major}" as a major and "${minors?.join(", ")}" as minors at a Russell Group university.
${uniFilter}Search across the 24 Russell Group Universities and identify up to 10 undergraduate course titles featuring this particular combination (e.g., Joint Honours, Major/Minor, or single honours that heavily feature these subjects).

When identifying courses, ensure a diverse mix of standard degrees and specialized/vocational degrees that fit the major/minor combination.

For each course, provide:
1. Course Title
2. University Name
3. Mandatory A-level subjects (subjects they MUST study)
4. Helpful A-level subjects (not required but beneficial)
5. Helpful GCSE subjects (not required but beneficial)
6. Any relevant special conditions (e.g., portfolios, interviews, specific grades in certain subjects).
7. A valid URL to the course page if possible.

Return your response as a JSON array with this exact structure:
[
  {
    "title": "string",
    "university": "string",
    "a_level": {
      "mandatory": ["string"],
      "helpful": ["string"]
    },
    "gcse": {
      "helpful": ["string"]
    },
    "specialConditions": "string",
    "url": "string"
  }
]
`;

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: JSON_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      res.json(safeParseJSON(extractText(response)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate builder courses" });
    }
  });

  // ── Endpoint 4: generate-university-courses ────────────────────────────────
  app.post("/api/generate-university-courses", async (req, res) => {
    const { subjects, university } = req.body;

    const universityFilter =
      university === "All Universities" || !university
        ? "Provide a representative sample of 5 courses from a variety of UK Russell Group universities."
        : `Provide up to 5 courses specifically from ${university}.`;

    const prompt = `
You are an expert UK university admissions advisor, acting as a nuanced data filter.
Your task is to find suitable undergraduate degree courses for a student with the A-level subjects: "${subjects.join(", ")}".
${universityFilter}

You must follow these rules:
1. **Verification:** All information MUST be verified against the official university website and UCAS for the upcoming academic year. All URLs must be valid and deep-link directly to the course information page.
2. **Course Diversity:** Ensure the courses represent a diverse mix of degree types. Do not just list generic degrees (e.g., if the student has Biology and Chemistry, do not just list Biomedical Science courses; you must include specific vocational courses like Dentistry, Veterinary Science, or Optometry if they meet the strict requirements).
3. **Subject Matching:** A course is a valid match if its list of *required* A-level subjects is a subset of the student's subjects ("${subjects.join(", ")}"). Use fuzzy matching for subject names (e.g., "Maths" matches "Mathematics", "Biology" matches "a science subject").
4. **No Extraneous Requirements:** If a course requires any A-level subject not in the student's list, it MUST be excluded from the results.
5. **Recommended Subjects:** 'recommendedSubjects' can include subjects outside the student's list.
6. **Matching Explanation:** Provide a detailed explanation in 'matchingExplanation' about how the student's subjects fit the course requirements.

Return your response as a JSON array with this exact structure:
[
  {
    "courseName": "string",
    "universityName": "string",
    "url": "string",
    "typicalOffer": "string",
    "requiredSubjects": ["string"],
    "recommendedSubjects": ["string"],
    "gcseRequirements": "string",
    "matchingExplanation": "string"
  }
]
`;

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: JSON_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      res.json(safeParseJSON(extractText(response)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate university courses" });
    }
  });

  // ── Endpoint 5: generate-what-if-story ────────────────────────────────────
  app.post("/api/generate-what-if-story", async (req, res) => {
    const { originalSubjects, newCombination } = req.body;

    const prompt = `
A GCSE student is considering changing one of their A-level subjects.
Original combination: ${originalSubjects.join(", ")}.
New combination: ${newCombination.join(", ")}.

Write an inspirational "Future Story" (2-3 paragraphs, markdown formatted) for them. Focus on the new possibilities and career paths opened up by this change. Maintain an encouraging and ambitious tone suitable for a 14-15 year old.

Return your response as plain text (the story itself, not wrapped in JSON).
`;

    try {
      // This endpoint returns plain text, not JSON — use a plain system prompt
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system:
          "You are an expert UK university admissions and careers advisor. Write in an inspirational, encouraging tone suitable for teenagers.",
        messages: [{ role: "user", content: prompt }],
      });
      res.json({ text: extractText(response) });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate what-if story" });
    }
  });

  // ── Endpoint 6: generate-skip-info ────────────────────────────────────────
  app.post("/api/generate-skip-info", async (req, res) => {
    const { subjects } = req.body;

    const prompt = `
For each of the following A-level subjects, analyze whether a student can study a related degree at a top UK (Russell Group) university without having taken the subject at A-level.
Subjects: ${subjects.join(", ")}.
Rely on official UCAS and university guidance.
For each subject, determine if it can be skipped and provide a brief explanation.

Return your response as a JSON array with this exact structure:
[
  { "subject": "string", "canSkip": boolean, "details": "string" }
]
`;

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: JSON_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      res.json(safeParseJSON(extractText(response)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate skip info" });
    }
  });

  // ── Endpoint 7: map-career-to-dreamer-course ───────────────────────────────
  app.post("/api/map-career-to-dreamer-course", async (req, res) => {
    const { careerInput, worldsInfo } = req.body;

    const prompt = `
You are a career mapping expert.
A student says: "${careerInput}".
Map this interest to the most relevant "World" and "Course" from the following list:
${JSON.stringify(worldsInfo)}

Return your response as a JSON object with this exact structure:
{ "worldId": "string", "courseTitle": "string" }
If no reasonable match exists, return empty strings for both fields.
`;

    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 256,
        system: JSON_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      });
      res.json(safeParseJSON(extractText(response)));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to map career" });
    }
  });

  // ── Vite middleware (development) / static (production) ───────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("(.*)", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
