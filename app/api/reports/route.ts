import { createClient } from "@supabase/supabase-js";

type SaveReportBody = {
  content?: unknown;
  title?: unknown;
};

function createAuthorizedSupabase(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!supabaseUrl || !supabaseAnonKey || !token) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function getReportTitle(title: unknown, content: string) {
  if (typeof title === "string" && title.trim()) {
    return title.trim().slice(0, 180);
  }

  const heading = content.match(/^#\s*(?:📊\s*)?Raport:\s*(.+)$/m)?.[1]?.trim();

  return (heading || "Raport").slice(0, 180);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveReportBody;
    const content = typeof body.content === "string" ? body.content.trim() : "";

    if (!content) {
      return Response.json(
        { error: "Treść raportu jest wymagana." },
        { status: 400 },
      );
    }

    const supabase = createAuthorizedSupabase(request);

    if (!supabase) {
      return Response.json(
        { error: "Zaloguj się, żeby zapisać raport w bazie." },
        { status: 401 },
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        { error: "Nie udało się potwierdzić użytkownika." },
        { status: 401 },
      );
    }

    const { data, error } = await supabase
      .from("reports")
      .insert({
        content,
        title: getReportTitle(body.title, content),
        user_id: user.id,
      })
      .select("id, title, created_at")
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ report: data });
  } catch {
    return Response.json({ error: "Niepoprawne body JSON." }, { status: 400 });
  }
}
