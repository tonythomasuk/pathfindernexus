import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import type { BaseAnalysis, UniversityCourse, SkipSubjectInfo, BuilderCourse } from '../types';

// Commented out to replace with Vercel flexibility
//const getApiKey = (): string => {
//    return process.env.API_KEY as string;
//};

//Get Application ready to work in a Vercel environment
const getApiKey = (): string => {
    // Vercel automatically injects environment variables prefixed with VITE_ into the import.meta.env object.
    // We check the hostname to determine if the app is running in the Vercel environment.
    if (window.location.hostname.endsWith('.vercel.app')) {
        // In a Vercel environment (or during local dev with a .env file),
        // use the custom key. 'VITE_API_KEY' is a standard convention.
        return import.meta.env.VITE_API_KEY as string;
    }

    // In the default environment (e.g., Google's Canvas), use the provided API_KEY.
    return process.env.API_KEY as string;
};
//End of newly inserted text

const getAIClient = () => new GoogleGenAI({ apiKey: getApiKey() });

const baseAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        futureStory: {
            type: Type.OBJECT,
            description: "A structured, inspirational story about the subject combination.",
            properties: {
                introduction: { type: Type.STRING, description: "A compelling opening paragraph (markdown formatted)." },
                body: { type: Type.STRING, description: "2-3 paragraphs (markdown formatted) detailing skills, real-world application, and synergy between subjects. Use bold for key skills." },
                conclusion: { type: Type.STRING, description: "A powerful concluding paragraph (markdown formatted) to inspire the student." }
            },
            required: ["introduction", "body", "conclusion"]
        },
        popularCareers: {
            type: Type.ARRAY,
            description: "A diverse list of 8 to 10 popular careers for this subject combination, explicitly linked to degree pathways, ensuring a mix of broad fields and specific vocational routes.",
            items: {
                type: Type.OBJECT,
                properties: {
                    careerName: { type: Type.STRING },
                    summary: { type: Type.STRING, description: "A one-line summary of the career and how the subjects are helpful." },
                    degreePathways: { type: Type.ARRAY, items: { type: Type.STRING }, description: "The university degree categories that typically lead to this career (e.g., 'STEM Degrees')." },
                    companies: { type: Type.ARRAY, items: { type: Type.STRING }, description: "1-2 example UK companies from different sectors that hire for this role." },
                },
                required: ["careerName", "summary", "degreePathways", "companies"]
            },
        },
        earningPotential: {
            type: Type.OBJECT,
            description: "A structured summary of earning potential based on official UK data.",
            properties: {
                summary: { type: Type.STRING, description: "An introductory paragraph (markdown formatted) summarizing the overall earning potential." },
                careerSpecifics: {
                    type: Type.ARRAY,
                    description: "A list of earning potentials for specific careers.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            careerName: { type: Type.STRING },
                            earningInfo: { type: Type.STRING, description: "A sentence (markdown formatted) with quantitative data (e.g., salary ranges) for this career 2 years post-graduation." }
                        },
                        required: ["careerName", "earningInfo"]
                    }
                },
                outlook: { type: Type.STRING, description: "A concluding sentence (markdown formatted) on the financial outlook." }
            },
            required: ["summary", "careerSpecifics", "outlook"]
        },
    },
    required: ["futureStory", "popularCareers", "earningPotential"]
};

export const generateInitialAnalysis = async (subjects: string[]): Promise<BaseAnalysis> => {
    const response = await fetch("/api/generate-initial-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjects }),
    });
    if (!response.ok) throw new Error("Failed to generate analysis");
    return await response.json();
};

export const generateBuilderCourses = async (major: string, minors: string[], targetUniversities: string[] = []): Promise<BuilderCourse[]> => {
    const response = await fetch("/api/generate-builder-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ major, minors, targetUniversities }),
    });
    if (!response.ok) throw new Error("Failed to generate builder courses");
    return await response.json();
};

export const generateUniversityCourses = async (subjects: string[], university: string = 'All Universities'): Promise<UniversityCourse[]> => {
    const response = await fetch("/api/generate-university-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjects, university }),
    });
    if (!response.ok) throw new Error("Failed to generate university courses");
    return await response.json();
}

export const generateWhatIfStory = async (originalSubjects: string[], newCombination: string[]): Promise<string> => {
    const response = await fetch("/api/generate-what-if-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalSubjects, newCombination }),
    });
    if (!response.ok) throw new Error("Failed to generate what-if story");
    const data = await response.json();
    return data.text;
};

export const generateSkipInfo = async (subjects: string[]): Promise<SkipSubjectInfo[]> => {
    const response = await fetch("/api/generate-skip-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjects }),
    });
    if (!response.ok) throw new Error("Failed to generate skip info");
    return await response.json();
};

export const mapCareerToDreamerCourse = async (careerInput: string, worlds: any[]): Promise<{ worldId: string, courseTitle: string } | null> => {
    const worldsInfo = worlds.map(w => ({
        id: w.id,
        name: w.world_name,
        courses: w.courses.map(c => c.title)
    }));

    const response = await fetch("/api/map-career-to-dreamer-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careerInput, worldsInfo }),
    });
    if (!response.ok) throw new Error("Failed to map career");
    return await response.json();
};
