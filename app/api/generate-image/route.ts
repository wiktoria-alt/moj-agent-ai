import { GoogleGenAI, Modality } from "@google/genai";
import { getAiModel, googleImageModelIds } from "../../lib/models";

export const maxDuration = 35;

type GenerateImageRequest = {
  model?: unknown;
  prompt?: unknown;
};

type ImagePart = {
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
  text?: string;
};

function getGoogleApiKey() {
  return process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

function createErrorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function getApiErrorStatus(error: unknown) {
  return typeof error === "object" &&
    error != null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("IMAGE_GENERATION_TIMEOUT")), timeoutMs);
    }),
  ]);
}

export async function POST(req: Request) {
  let body: GenerateImageRequest;

  try {
    body = await req.json();
  } catch {
    return createErrorResponse("Niepoprawne body JSON.", 400);
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const selectedModel = getAiModel(body.model);

  if (!prompt) {
    return createErrorResponse("Brakuje promptu obrazu.", 400);
  }

  const apiKey = getGoogleApiKey();

  if (!apiKey) {
    return createErrorResponse(
      "Brakuje klucza Google API. Ustaw GOOGLE_API_KEY albo GOOGLE_GENERATIVE_AI_API_KEY.",
      500,
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const imagePrompt = `Generate an image from this user description. Return an image, not only text. User description: ${prompt}`;

    const response = await withTimeout(
      ai.models.generateContent({
        model: googleImageModelIds[selectedModel],
        contents: imagePrompt,
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
      }),
      30000,
    );

    const parts =
      (response.candidates?.[0]?.content?.parts as ImagePart[] | undefined) ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data);
    const text =
      parts
        .filter((part) => typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
        .trim() || "Gotowe - obraz został wygenerowany.";

    if (!imagePart?.inlineData?.data) {
      return createErrorResponse(
        "Model nie zwrócił obrazu. Spróbuj doprecyzować opis i wygenerować ponownie.",
        500,
      );
    }

    const mimeType = imagePart.inlineData.mimeType ?? "image/png";

    return Response.json({
      image: `data:${mimeType};base64,${imagePart.inlineData.data}`,
      model: selectedModel,
      text,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "IMAGE_GENERATION_TIMEOUT") {
      return createErrorResponse(
        "Generowanie obrazu przekroczyło limit 30 sekund. Spróbuj ponownie.",
        500,
      );
    }

    if (getApiErrorStatus(error) === 429) {
      return createErrorResponse(
        "Limit Google API dla modelu obrazowego jest teraz wyczerpany. Spróbuj ponownie później albo sprawdź limity projektu w Google AI Studio.",
        500,
      );
    }

    return createErrorResponse(
      "Nie udało się wygenerować obrazu. Sprawdź prompt i spróbuj ponownie.",
      500,
    );
  }
}
