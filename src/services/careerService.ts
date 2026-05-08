// Simple in-memory cache
const cache = new Map<string, any>();

export const generateCareerRequirements = async (jobTitle: string) => {
    if (cache.has(jobTitle)) {
        return cache.get(jobTitle);
    }

    try {
        const response = await fetch("/api/generate-career-requirements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobTitle }),
        });
        if (!response.ok) throw new Error("Failed to generate career requirements");
        const result = await response.json();

        cache.set(jobTitle, result);
        return result;
    } catch (e) {
        console.error("Failed to generate career requirements:", e);
        throw new Error("Could not generate career requirements.");
    }
};
