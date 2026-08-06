import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { getModelErrorMessage } from "../../lib/errors";
import { googleModelIds } from "../../lib/models";

export const maxDuration = 60;

const languages = {
  auto: "wykryty automatycznie",
  pl: "polski",
  en: "angielski",
  de: "niemiecki",
  fr: "francuski",
  es: "hiszpański",
  it: "włoski",
  uk: "ukraiński",
  ru: "rosyjski",
} as const;

type LanguageCode = keyof typeof languages;

function getLanguage(value: unknown, fallback: LanguageCode): LanguageCode {
  return typeof value === "string" && value in languages
    ? (value as LanguageCode)
    : fallback;
}

export async function POST(req: Request) {
  try {
    if (!process.env.GOOGLE_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return Response.json(
        {
          error:
            "Brakuje klucza Google API. Dodaj GOOGLE_API_KEY albo GOOGLE_GENERATIVE_AI_API_KEY w Vercel.",
        },
        { status: 500 },
      );
    }

    const body = (await req.json()) as {
      source?: unknown;
      target?: unknown;
      text?: unknown;
    };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const source = getLanguage(body.source, "auto");
    const target = getLanguage(body.target, "pl");

    if (!text) {
      return Response.json({ error: "Wklej tekst do przetłumaczenia." }, { status: 400 });
    }

    if (text.length > 8000) {
      return Response.json(
        { error: "Tekst jest za długi. Podziel go na krótsze części." },
        { status: 400 },
      );
    }

    const result = await generateText({
      maxOutputTokens: 3000,
      maxRetries: 0,
      model: google(googleModelIds.flash),
      prompt: `Przetłumacz poniższy tekst z języka: ${languages[source]} na język: ${languages[target]}.

Zasady:
- Zwróć tylko gotowe tłumaczenie.
- Zachowaj akapity, listy i sens tekstu.
- Nie dodawaj komentarzy ani wyjaśnień.

Tekst:
${text}`,
      temperature: 0.1,
      timeout: {
        totalMs: 45000,
      },
    });

    return Response.json({ translatedText: result.text.trim() });
  } catch (error) {
    return Response.json(
      { error: getModelErrorMessage(error, "flash") },
      { status: 500 },
    );
  }
}
