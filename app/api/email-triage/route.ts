import { google } from "@ai-sdk/google";
import { streamText } from "ai";

export const maxDuration = 60;

const systemPrompt = `Jesteś profesjonalnym asystentem do zarządzania pocztą.

Dla KAŻDEGO maila wykonaj:
1. 📧 KATEGORYZACJA: określ typ (zapytanie ofertowe / reklamacja / spam / informacja / prośba o spotkanie)
2. 🔴🟡🟢 PRIORYTET: Wysoki (wymaga odpowiedzi dziś) / Średni (w ciągu 3 dni) / Niski (może poczekać)
3. ✍️ DRAFT: Napisz krótki, profesjonalny szkic odpowiedzi (3-5 zdań)

FORMAT ODPOWIEDZI:
Dla każdego maila:

### Mail [numer]: [krótki temat]
| Kategoria | [typ] |
| Priorytet | [🔴 Wysoki / 🟡 Średni / 🟢 Niski] |
| Uzasadnienie | [dlaczego ten priorytet] |

**Proponowana odpowiedź:**
> [draft odpowiedzi]

---

Na końcu: PODSUMOWANIE
- 🔴 Pilne: [ile] maili
- 🟡 Średnie: [ile] maili
- 🟢 Niskie: [ile] maili
- ✅ Rekomendacja: [który mail obsłużyć najpierw]

Dla spamu nie proponuj odpowiedzi do wysłania. W drafcie napisz krótko: "Brak odpowiedzi - oznaczyć jako spam." Odpowiadaj po polsku.`;

type EmailTriageRequest = {
  emails?: unknown;
};

function isValidEmails(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((email) => typeof email === "string" && email.trim().length > 0)
  );
}

export async function POST(req: Request) {
  const body = (await req.json()) as EmailTriageRequest;

  if (!isValidEmails(body.emails)) {
    return Response.json(
      { error: "Prześlij JSON w formacie { emails: string[] }." },
      { status: 400 },
    );
  }

  const prompt = body.emails
    .map((email, index) => `MAIL ${index + 1}\n${email.trim()}`)
    .join("\n\n---\n\n");

  const result = streamText({
    maxOutputTokens: 3600,
    maxRetries: 0,
    model: google("gemini-3.1-flash-lite"),
    prompt,
    system: systemPrompt,
    temperature: 0.2,
  });

  return result.toTextStreamResponse();
}
