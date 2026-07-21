import { createEmbedding, embeddingModel } from "../../lib/embeddings";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";

    if (!text) {
      return Response.json({ error: "Pole text jest wymagane." }, { status: 400 });
    }

    const embedding = await createEmbedding(text);
    return Response.json({ embedding, model: embeddingModel });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nie udało się utworzyć embeddingu.";
    return Response.json({ error: message }, { status: 500 });
  }
}
