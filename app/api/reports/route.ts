import { createClient } from "@supabase/supabase-js";

type SaveReportBody = {
  content?: unknown;
  title?: unknown;
};

type StoredReport = {
  content: string;
  created_at: string;
  id: string;
  title: string;
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

function isMissingReportsTableError(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    (message.includes("public.reports") && message.includes("schema cache")) ||
    (message.includes("relation") && message.includes("reports"))
  );
}

export async function GET(request: Request) {
  try {
    const supabase = createAuthorizedSupabase(request);

    if (!supabase) {
      return Response.json(
        { error: "Zaloguj się, żeby zobaczyć zapisane raporty." },
        { status: 401 },
      );
    }

    const { data, error } = await supabase
      .from("reports")
      .select("id, title, content, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error) {
      return Response.json({ reports: data ?? [], storage: "reports" });
    }

    if (!isMissingReportsTableError(error)) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const { data: documents, error: documentsError } = await supabase
      .from("documents")
      .select("id, title, content, created_at, metadata")
      .eq("metadata->>type", "report")
      .order("created_at", { ascending: false })
      .limit(50);

    if (documentsError) {
      return Response.json({ error: documentsError.message }, { status: 500 });
    }

    const reports: StoredReport[] = (documents ?? []).map((document) => ({
      content: String(document.content ?? ""),
      created_at: document.created_at,
      id: document.id,
      title: document.title ?? "Raport",
    }));

    return Response.json({ reports, storage: "documents" });
  } catch {
    return Response.json(
      { error: "Nie udało się pobrać zapisanych raportów." },
      { status: 500 },
    );
  }
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

    const title = getReportTitle(body.title, content);
    const { data, error } = await supabase
      .from("reports")
      .insert({
        content,
        title,
        user_id: user.id,
      })
      .select("id, title, created_at")
      .single();

    if (error) {
      if (isMissingReportsTableError(error)) {
        const { data: documentData, error: documentError } = await supabase
          .from("documents")
          .insert({
            content,
            metadata: {
              source: "report-generator",
              type: "report",
            },
            title,
            user_id: user.id,
          })
          .select("id, title, created_at")
          .single();

        if (documentError) {
          return Response.json({ error: documentError.message }, { status: 500 });
        }

        return Response.json({
          report: documentData,
          storage: "documents",
          warning:
            "Tabela reports nie istnieje, więc raport zapisano w tabeli documents.",
        });
      }

      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ report: data, storage: "reports" });
  } catch {
    return Response.json({ error: "Niepoprawne body JSON." }, { status: 400 });
  }
}
