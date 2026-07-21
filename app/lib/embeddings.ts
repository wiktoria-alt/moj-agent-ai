import { GoogleGenAI } from "@google/genai";

export const embeddingModel = "gemini-embedding-2";
export const embeddingDimensions = 768;

function getGoogleApiKey() {
  return process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

export async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    throw new Error(
      "Brakuje klucza Google API. Ustaw GOOGLE_API_KEY albo GOOGLE_GENERATIVE_AI_API_KEY.",
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.embedContent({
    model: embeddingModel,
    contents: text,
    config: { outputDimensionality: embeddingDimensions },
  });
  const values = response.embeddings?.[0]?.values;

  if (!Array.isArray(values) || values.length !== embeddingDimensions) {
    throw new Error(
      `Model embeddingów nie zwrócił wektora o długości ${embeddingDimensions}.`,
    );
  }

  return values;
}
