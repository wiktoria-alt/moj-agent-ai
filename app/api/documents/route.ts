import { createClient } from "@supabase/supabase-js";

type DocumentRow = {
  content?: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  user_id?: string;
  title: string;
};

const systemKnowledgeTitlePatterns = [
  "%kredycie konsumenckim%",
  "%kredytu konsumenckiego%",
  "%ustawa z 12.05.2011%",
  "%art. 30%",
  "%art 30%",
];

function isSystemKnowledgeTitle(title: string) {
  const normalized = title.toLowerCase();

  return (
    normalized.includes("kredycie konsumenckim") ||
    normalized.includes("kredytu konsumenckiego") ||
    normalized.includes("ustawa z 12.05.2011") ||
    normalized.includes("art. 30") ||
    normalized.includes("art 30")
  );
}

async function fetchSystemKnowledgeRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
) {
  const rows: DocumentRow[] = [];
  const seen = new Set<string>();

  for (const pattern of systemKnowledgeTitlePatterns) {
    const { data, error } = await supabase
      .from("documents")
      .select("title, created_at, user_id")
      .ilike("title", pattern)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw error;

    for (const row of (data ?? []) as DocumentRow[]) {
      const key = `${row.title}|${row.created_at}|${row.user_id ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }

  return rows;
}

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
    let query = supabase
      .from("documents")
      .select("title, content, metadata, created_at")
      .eq("title", title)
      .order("created_at", { ascending: true });

    if (!isSystemKnowledgeTitle(title)) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ fragments: data ?? [], title });
  }

  const { data, error } = await supabase
    .from("documents")
    .select("title, created_at, user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let systemRows: DocumentRow[] = [];

  try {
    systemRows = await fetchSystemKnowledgeRows(supabase);
  } catch {
    systemRows = [];
  }

  const grouped = new Map<
    string,
    { chunks: number; created_at: string; system?: boolean; title: string }
  >();

  for (const row of [...((data ?? []) as DocumentRow[]), ...systemRows]) {
    const existing = grouped.get(row.title);
    const isSystem = isSystemKnowledgeTitle(row.title) && row.user_id !== userId;

    if (existing) {
      existing.chunks += 1;
      existing.system = existing.system || isSystem;
    } else {
      grouped.set(row.title, {
        chunks: 1,
        created_at: row.created_at,
        system: isSystem,
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
