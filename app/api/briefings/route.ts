import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Brakuje NEXT_PUBLIC_SUPABASE_URL lub klucza Supabase.");
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("briefings")
      .select("id, created_at, content, date")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({ briefings: data ?? [] });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać briefingów.",
      },
      { status: 500 },
    );
  }
}
