import type { BaseAnalysis, UniversityCourse, SkipSubjectInfo, BuilderCourse } from '../types';

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
};

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
        courses: w.courses.map((c: any) => c.title)
    }));

    const response = await fetch("/api/map-career-to-dreamer-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ careerInput, worldsInfo }),
    });
    if (!response.ok) throw new Error("Failed to map career");
    return await response.json();
};
