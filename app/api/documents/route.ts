import { createClient } from "@supabase/supabase-js";

type DocumentRow = {
  content?: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  title: string;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Brakuje konfiguracji Supabase.");
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
    throw new Error("Zaloguj się, aby korzystać z bazy wiedzy.");
  }

  const supabase = getSupabaseAuthClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new Error("Sesja wygasła. Zaloguj się ponownie.");
  }

  return data.user.id;
}

export async function GET(request: Request) {
  let userId = "";

  try {
    userId = await getUserId(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Brak dostępu." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  const title = new URL(request.url).searchParams.get("title")?.trim();

  if (title) {
    const { data, error } = await supabase
      .from("documents")
      .select("title, content, metadata, created_at")
      .eq("title", title)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ fragments: data ?? [], title });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("title, created_at")
    .eq("user_id", userId)
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
    const userId = await getUserId(request);
    const supabase = getSupabaseAdmin();
    const body = (await request.json()) as { title?: unknown };
    const title = typeof body.title === "string" ? body.title.trim() : "";

    if (!title) {
      return Response.json({ error: "Tytuł jest wymagany." }, { status: 400 });
    }

    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("title", title)
      .eq("user_id", userId);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: "Niepoprawne body JSON." }, { status: 400 });
  }
}
