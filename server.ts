import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { PostHog } from "posthog-node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to safely parse JSON from Gemini response which might include markdown formatting
function safeParseJSON(text: string | null | undefined) {
  if (!text) return {};
  try {
    const cleanText = text.replace(/^```json\s*/im, '').replace(/```\s*$/im, '');
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to parse JSON response:", text);
    throw e;
  }
}

// Initialize Sentry
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      nodeProfilingIntegration(),
    ],
    tracesSampleRate: 1.0,
  });
}

// Initialize PostHog
const posthog = process.env.POSTHOG_API_KEY && process.env.POSTHOG_HOST 
  ? new PostHog(process.env.POSTHOG_API_KEY, { host: process.env.POSTHOG_HOST })
  : null;

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Sentry request handler
  
  app.use(cors());
  app.use(express.json());
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY environment variable is not set.");
  }
  const ai = new GoogleGenAI({ apiKey: apiKey || "" });

  // API Routes
  app.post("/api/generate-initial-analysis", async (req, res) => {
    const { subjects } = req.body;
    if (!subjects || !Array.isArray(subjects)) {
      return res.status(400).json({ error: "Subjects array is required" });
    }

    const prompt = `
        You are an expert UK university admissions and careers advisor for GCSE students (age 14-15).
        Analyze the A-level subject combination: ${subjects.join(', ')}.
        Your response must be grounded in official, authoritative UK sources like the Russell Group's 'Informed Choices' guide, UCAS, HESA, and OfQual data.
        CRITICAL INSTRUCTION: Your analysis must first identify the most common university degree categories these subjects lead to (e.g., 'STEM & Engineering', 'Humanities & Social Sciences', 'Creative Arts', 'Business & Economics'). Then, for each career you suggest, you MUST populate the 'degreePathways' field with the relevant categories. This creates a clear pathway from A-levels to degree to career.
        CRITICAL INSTRUCTION: Ensure the suggested careers represent a diverse mix of options. If the subject combination is a strong prerequisite for specific vocational or competitive professional degrees (e.g., Dentistry, Veterinary Medicine, Architecture, Allied Health Professions), you MUST include them alongside broader academic fields. Do not just list generic options. Provide 8 to 10 diverse careers.
        CRITICAL INSTRUCTION: In the 'body' of the story, provide a detailed analysis of how each of the chosen subjects interacts with the others. Explain the unique ways they complement each other, how they can be applied together in real-world scenarios, and how they collectively build a powerful, versatile skill set for the student.
        Provide a detailed, inspirational, and accurate analysis.
        Correct any subject name typos to their standard A-level names.
        Return the data in the specified JSON schema. Ensure all markdown fields are formatted for readability with paragraphs, bold text for emphasis on skills and figures, and lists where appropriate.
    `;

    const baseAnalysisSchema = {
        type: Type.OBJECT,
        properties: {
            futureStory: {
                type: Type.OBJECT,
                properties: {
                    introduction: { type: Type.STRING },
                    body: { type: Type.STRING },
                    conclusion: { type: Type.STRING }
                },
                required: ["introduction", "body", "conclusion"]
            },
            popularCareers: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        careerName: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        degreePathways: { type: Type.ARRAY, items: { type: Type.STRING } },
                        companies: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ["careerName", "summary", "degreePathways", "companies"]
                },
            },
            earningPotential: {
                type: Type.OBJECT,
                properties: {
                    summary: { type: Type.STRING },
                    careerSpecifics: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                careerName: { type: Type.STRING },
                                earningInfo: { type: Type.STRING }
                            },
                            required: ["careerName", "earningInfo"]
                        }
                    },
                    outlook: { type: Type.STRING }
                },
                required: ["summary", "careerSpecifics", "outlook"]
            },
        },
        required: ["futureStory", "popularCareers", "earningPotential"]
    };

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: baseAnalysisSchema
        },
      });
      res.json(safeParseJSON(response.text));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate analysis" });
    }
  });

  app.post("/api/generate-career-requirements", async (req, res) => {
    const { jobTitle } = req.body;
    if (!jobTitle) {
      return res.status(400).json({ error: "Job title is required" });
    }

    const COMMON_A_LEVEL_SUBJECTS = [
        "Mathematics", "Further Mathematics", "Physics", "Chemistry", "Biology", "Computer Science",
        "English Literature", "English Language", "History", "Geography", "Economics", "Psychology",
        "Sociology", "Religious Studies", "Philosophy", "Art and Design", "Music", "Drama",
        "French", "German", "Spanish", "Business Studies", "Accounting", "Politics"
    ];

    const careerRequirementsSchema = {
        type: Type.OBJECT,
        properties: {
            aLevelSubjects: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: `Typical UK A-level subjects required or highly recommended. MUST be from this list or standard UK A-levels: ${COMMON_A_LEVEL_SUBJECTS.join(", ")}.`
            },
            universityCourses: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
            },
            explanation: {
                type: Type.STRING,
            }
        },
        required: ["aLevelSubjects", "universityCourses", "explanation"]
    };

    const prompt = `
        You are an expert UK careers advisor.
        For the job title: "${jobTitle}", identify:
        1. Typical UK A-level subjects required or highly recommended. ONLY include standard UK A-level subjects. DO NOT include non-A-level subjects like Statistics, Programming, or general skills.
        2. Typical university degree pathways.
        3. A brief explanation of the relevance.
        
        Return the data as a JSON object matching the specified schema.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: careerRequirementsSchema
        },
      });
      res.json(safeParseJSON(response.text));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate career requirements" });
    }
  });

  app.post("/api/generate-builder-courses", async (req, res) => {
    const { major, minors, targetUniversities } = req.body;
    const uniFilter = targetUniversities && targetUniversities.length > 0 
        ? `Prioritize searching for courses at these specific universities: ${targetUniversities.join(', ')}. If courses are available at these universities, include them first. `
        : "";
    const prompt = `
        You are an expert UK university admissions advisor.
        A student wants to study a combination of "${major}" as a major and "${minors?.join(', ')}" as minors at a Russell Group university.
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
        
        Return the data as a JSON array matching the specified schema.
    `;
    
    const builderSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                university: { type: Type.STRING },
                a_level: {
                    type: Type.OBJECT,
                    properties: {
                        mandatory: { type: Type.ARRAY, items: { type: Type.STRING } },
                        helpful: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["mandatory", "helpful"]
                },
                gcse: {
                    type: Type.OBJECT,
                    properties: {
                        helpful: { type: Type.ARRAY, items: { type: Type.STRING } }
                    },
                    required: ["helpful"]
                },
                specialConditions: { type: Type.STRING },
                url: { type: Type.STRING }
            },
            required: ["title", "university", "a_level", "gcse", "specialConditions"]
        }
    };

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: builderSchema
        },
      });
      res.json(safeParseJSON(response.text));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate builder courses" });
    }
  });

  app.post("/api/generate-university-courses", async (req, res) => {
    const { subjects, university } = req.body;
    const universityFilter = university === 'All Universities' || !university
        ? "Provide a representative sample of 5 courses from a variety of UK Russell Group universities."
        : `Provide up to 5 courses specifically from ${university}.`;

    const prompt = `
        You are an expert UK university admissions advisor, acting as a nuanced data filter.
        Your task is to find suitable undergraduate degree courses for a student with the A-level subjects: "${subjects.join(', ')}".
        ${universityFilter}
        You must follow these rules:
        1.  **Verification:** All information MUST be verified against the official university website and UCAS for the upcoming academic year. All URLs must be valid and deep-link directly to the course information page.
        2.  **Course Diversity:** Ensure the courses represent a diverse mix of degree types. Do not just list generic degrees (e.g., if the student has Biology and Chemistry, do not just list Biomedical Science courses; you must include specific vocational courses like Dentistry, Veterinary Science, or Optometry if they meet the strict requirements).
        3.  **Subject Matching:** A course is a valid match if its list of *required* A-level subjects is a subset of the student's subjects ("${subjects.join(', ')}"). Use fuzzy matching for subject names (e.g., "Maths" matches "Mathematics", "Biology" matches "a science subject").
        4.  **No Extraneous Requirements:** If a course requires any A-level subject not in the student's list, it MUST be excluded from the results.
        5.  **Recommended Subjects:** 'recommendedSubjects' can include subjects outside the student's list.
        6.  **Matching Explanation:** Provide a detailed explanation in 'matchingExplanation' about how the student's subjects fit the course requirements, especially for recommended subjects. For example, "Your Maths and Physics are required, and your Chemistry is highly recommended for this Engineering course."
        Return the data as a JSON array matching the specified schema.
    `;
    
     const courseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                courseName: { type: Type.STRING },
                universityName: { type: Type.STRING },
                url: { type: Type.STRING },
                typicalOffer: { type: Type.STRING },
                requiredSubjects: { type: Type.ARRAY, items: { type: Type.STRING } },
                recommendedSubjects: { type: Type.ARRAY, items: { type: Type.STRING } },
                gcseRequirements: { type: Type.STRING },
                matchingExplanation: { type: Type.STRING },
            },
            required: ["courseName", "universityName", "url", "typicalOffer", "requiredSubjects", "recommendedSubjects", "gcseRequirements", "matchingExplanation"]
        }
    };

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: courseSchema
        },
      });
      res.json(safeParseJSON(response.text));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate university courses" });
    }
  });

  app.post("/api/generate-what-if-story", async (req, res) => {
    const { originalSubjects, newCombination } = req.body;
    const prompt = `
        A GCSE student is considering changing one of their A-level subjects.
        Original combination: ${originalSubjects.join(', ')}.
        New combination: ${newCombination.join(', ')}.
        Write an inspirational "Future Story" (2-3 paragraphs, markdown formatted) for them. Focus on the new possibilities and career paths opened up by this change. Maintain an encouraging and ambitious tone suitable for a 14-15 year old.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      res.json({ text: response.text });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate what-if story" });
    }
  });

  app.post("/api/generate-skip-info", async (req, res) => {
    const { subjects } = req.body;
    const prompt = `
        For each of the following A-level subjects, analyze whether a student can study a related degree at a top UK (Russell Group) university without having taken the subject at A-level.
        Subjects: ${subjects.join(', ')}.
        Rely on official UCAS and university guidance.
        For each subject, determine if it can be skipped and provide a brief explanation.
        Return the response as a JSON array with this exact structure:
        [{"subject": "Subject Name", "canSkip": boolean, "details": "Explanation..."}]
    `;
    
    const skipSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                subject: { type: Type.STRING },
                canSkip: { type: Type.BOOLEAN },
                details: { type: Type.STRING }
            },
            required: ["subject", "canSkip", "details"]
        }
    };

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: skipSchema
        }
      });
      res.json(safeParseJSON(response.text));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to generate skip info" });
    }
  });

  app.post("/api/map-career-to-dreamer-course", async (req, res) => {
    const { careerInput, worldsInfo } = req.body;
    const prompt = `
        You are a career mapping expert.
        A student says: "${careerInput}".
        Map this interest to the most relevant "World" and "Course" from the following list:
        ${JSON.stringify(worldsInfo)}
        
        Return a JSON object with "worldId" and "courseTitle". If no reasonable match exists, return empty strings for both.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              worldId: { type: Type.STRING },
              courseTitle: { type: Type.STRING }
            },
            required: ["worldId", "courseTitle"]
          }
        },
      });
      res.json(safeParseJSON(response.text));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to map career" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("(.*)", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Sentry error handler

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
