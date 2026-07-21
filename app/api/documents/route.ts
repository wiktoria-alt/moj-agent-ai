import { supabase } from "../../lib/supabase";

type DocumentRow = {
  content?: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  title: string;
};

export async function GET(request: Request) {
  const title = new URL(request.url).searchParams.get("title")?.trim();

  if (title) {
    const { data, error } = await supabase
      .from("documents")
      .select("title, content, metadata, created_at")
      .eq("title", title)
      .order("created_at", { ascending: true });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ fragments: data ?? [], title });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("title, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const grouped = new Map<
    string,
    { chunks: number; created_at: string; title: string }
  >();

  for (const row of (data ?? []) as DocumentRow[]) {
    const existing = grouped.get(row.title);
    if (existing) {
      existing.chunks += 1;
    } else {
      grouped.set(row.title, {
        chunks: 1,
        created_at: row.created_at,
        title: row.title,
      });
    }
  }

  return Response.json({ documents: Array.from(grouped.values()) });
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";

    if (!title) {
      return Response.json({ error: "Tytuł jest wymagany." }, { status: 400 });
    }

    const { error } = await supabase.from("documents").delete().eq("title", title);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Niepoprawne body JSON." }, { status: 400 });
  }
}
