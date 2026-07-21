import { splitIntoChunks } from "../../lib/chunking";
import { createEmbedding } from "../../lib/embeddings";
import { supabase } from "../../lib/supabase";

export const maxDuration = 60;

const encoder = new TextEncoder();

function streamLine(payload: object) {
  return encoder.encode(`${JSON.stringify(payload)}\n`);
}

export async function POST(request: Request) {
  let body: { title?: unknown; content?: unknown };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Niepoprawne body JSON." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!title || !content) {
    return Response.json(
      { error: "Tytuł i treść dokumentu są wymagane." },
      { status: 400 },
    );
  }

  const chunks = splitIntoChunks(content);
  if (!chunks.length) {
    return Response.json({ error: "Dokument nie zawiera treści." }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(streamLine({ type: "start", total: chunks.length }));

        for (let index = 0; index < chunks.length; index += 1) {
          const embedding = await createEmbedding(chunks[index]);
          const { error } = await supabase.from("documents").insert({
            title,
            content: chunks[index],
            embedding,
            metadata: {
              source: title,
              chunk_index: index,
              total_chunks: chunks.length,
            },
          });

          if (error) throw new Error(`Supabase: ${error.message}`);

          controller.enqueue(
            streamLine({
              type: "progress",
              current: index + 1,
              total: chunks.length,
            }),
          );
        }

        controller.enqueue(
          streamLine({
            type: "complete",
            success: true,
            chunks_saved: chunks.length,
          }),
        );
      } catch (error) {
        controller.enqueue(
          streamLine({
            type: "error",
            error:
              error instanceof Error
                ? error.message
                : "Nie udało się zapisać dokumentu.",
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}
