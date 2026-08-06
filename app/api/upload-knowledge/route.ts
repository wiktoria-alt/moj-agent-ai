import { splitIntoChunks } from "../../lib/chunking";
import { createEmbedding } from "../../lib/embeddings";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const encoder = new TextEncoder();

function streamLine(payload: object) {
  return encoder.encode(`${JSON.stringify(payload)}\n`);
}

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Brakuje konfiguracji Supabase do zapisu bazy wiedzy.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getSupabaseAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Brakuje konfiguracji Supabase Auth.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getUserId(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    throw new Error("Zaloguj się, aby dodać dokument do bazy wiedzy.");
  }

  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  }

  return data.user.id;
}

export async function POST(request: Request) {
  let body: { title?: unknown; content?: unknown };
  let userId = "";

  try {
    userId = await getUserId(request);
    body = await request.json();
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Niepoprawne body JSON.",
      },
      { status: 400 },
    );
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
        const supabase = getSupabaseAdmin();

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
            user_id: userId,
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
