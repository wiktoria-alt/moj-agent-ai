import { google } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";

export const maxDuration = 60;

type WebhookEventType = "alert" | "feedback" | "order";

type WebhookRequestBody = {
  data?: unknown;
  type?: unknown;
};

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Brakuje NEXT_PUBLIC_SUPABASE_URL lub klucza Supabase.");
  }

  return createClient(supabaseUrl, supabaseKey);
}

function isSupportedType(value: unknown): value is WebhookEventType {
  return value === "alert" || value === "feedback" || value === "order";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuthorized(request: Request) {
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!webhookSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization");
  const secretHeader = request.headers.get("x-webhook-secret");

  return authHeader === `Bearer ${webhookSecret}` || secretHeader === webhookSecret;
}

function getPromptForType(type: WebhookEventType, data: unknown) {
  const formattedData = JSON.stringify(data, null, 2);

  if (type === "feedback") {
    return `Przeanalizuj feedback klienta.

Dane:
${formattedData}

Zwróć:
- Sentiment: pozytywny / neutralny / negatywny
- Priorytet: wysoki / średni / niski
- Główne ryzyko
- Sugerowana odpowiedź do klienta w 3-5 zdaniach
- Następny krok dla zespołu`;
  }

  if (type === "alert") {
    return `Przeanalizuj alert techniczny.

Dane:
${formattedData}

Zwróć:
- Severity: critical / high / medium / low
- Co prawdopodobnie się dzieje
- Rekomendowana akcja natychmiastowa
- Kogo powiadomić
- Krótki komunikat statusowy dla interesariuszy`;
  }

  return `Przeanalizuj zdarzenie zamówienia.

Dane:
${formattedData}

Zwróć:
- Krótkie podsumowanie zamówienia
- Priorytet obsługi
- Potencjalne ryzyka lub braki danych
- Sugerowany komunikat potwierdzający do klienta`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = (await request.json()) as WebhookRequestBody;

    if (!isSupportedType(body.type)) {
      return Response.json(
        { error: "Pole type musi mieć wartość: feedback, alert albo order." },
        { status: 400 },
      );
    }

    if (!isRecord(body.data)) {
      return Response.json(
        { error: "Pole data musi być obiektem JSON." },
        { status: 400 },
      );
    }

    const { text } = await generateText({
      maxOutputTokens: 1600,
      maxRetries: 0,
      model: google("gemini-3.1-flash-lite"),
      prompt: getPromptForType(body.type, body.data),
      system: `Jesteś agentem operacyjnym reagującym na webhooki.
Analizujesz zdarzenia z zewnętrznych systemów i zapisujesz krótką, praktyczną analizę.
Odpowiadaj po polsku, konkretnie i w formacie Markdown.`,
      temperature: 0.25,
    });

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("webhook_events")
      .insert({
        analysis: text,
        data: body.data,
        type: body.type,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      analysis: text,
      event_id: data.id,
      success: true,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się obsłużyć webhooka.",
        success: false,
      },
      { status: 500 },
    );
  }
}
