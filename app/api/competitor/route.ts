import { google } from "@ai-sdk/google";
import {
  convertToModelMessages,
  isStepCount,
  streamText,
  type UIMessage,
} from "ai";
import { getModelErrorMessage } from "../../lib/errors";
import { reactTools } from "../../lib/reactTools";

export const maxDuration = 60;

type CompetitorRequestBody = {
  messages: UIMessage[];
};

const enableSearchGrounding =
  process.env.ENABLE_SEARCH_GROUNDING?.toLowerCase() === "true";

function createLocalUIMessageResponse(text: string) {
  const events = [
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: text },
    { type: "text-end", id: "0" },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];

  const body = `${events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;

  return new Response(body, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

function getCompetitorSystemPrompt() {
  const searchInstruction = enableSearchGrounding
    ? "- Używaj google_search dla aktualnych informacji, cen, porównań i źródeł branżowych."
    : "- Google Search grounding jest wyłączony. Używaj searchWikipedia i readWebPage dla podanych adresów URL; gdy brakuje aktualnych danych, zaznacz to wprost.";

  return `Jesteś analitykiem konkurencji. Gdy użytkownik poda nazwy firm,
AUTONOMICZNIE zbierasz informacje i porównujesz je.

## TWÓJ PROCES:
1. Dla KAŻDEJ firmy szukaj informacji: Google, Wikipedia, strony firmowe.
2. Zbierz: opis, branża, wielkość, produkty, ceny, mocne i słabe strony.
3. Stwórz tabelę porównawczą.
4. Napisz rekomendację w kontekście użytkownika.

## FORMAT:

# 🏢 Analiza konkurencji

## Porównanie

| Aspekt | [Firma 1] | [Firma 2] | [Firma 3] |
|--------|-----------|-----------|-----------|
| Branża | ... | ... | ... |
| Wielkość | ... | ... | ... |
| Główny produkt | ... | ... | ... |
| Mocne strony | ... | ... | ... |
| Słabe strony | ... | ... | ... |
| Ceny (orientacyjne) | ... | ... | ... |

## Szczegółowa analiza
[Rozwinięcie dla każdej firmy - 3-4 zdania]

## Rekomendacja
[Która firma jest najlepsza i dlaczego - w kontekście użytkownika]

## Źródła
[Linki do stron firmowych i artykułów]

ZASADY:
- Używaj prawdziwych danych z narzędzi.
${searchInstruction}
- Podawaj źródła przy konkretnych faktach, cenach i deklaracjach.
- Jeśli czegoś nie udało się potwierdzić, napisz to wprost.
- Porównanie ma być praktyczne, biznesowe i czytelne.
- Odpowiadaj po polsku.`;
}

export async function POST(req: Request) {
  const { messages }: CompetitorRequestBody = await req.json();

  try {
    if (enableSearchGrounding) {
      const tools = {
        google_search: reactTools.google_search,
        readWebPage: reactTools.readWebPage,
        searchWikipedia: reactTools.searchWikipedia,
      };
      const toolOrder = [
        "google_search",
        "searchWikipedia",
        "readWebPage",
      ] as const;

      const result = streamText({
        maxOutputTokens: 5200,
        maxRetries: 0,
        messages: await convertToModelMessages(messages, {
          ignoreIncompleteToolCalls: true,
          tools,
        }),
        model: google("gemini-3.1-flash-lite"),
        stopWhen: isStepCount(10),
        system: getCompetitorSystemPrompt(),
        temperature: 0.2,
        timeout: {
          totalMs: 60000,
        },
        toolChoice: "auto",
        toolOrder,
        tools,
      });

      return result.toUIMessageStreamResponse({
        onError: (error) => getModelErrorMessage(error, "lite"),
      });
    }

    const tools = {
      readWebPage: reactTools.readWebPage,
      searchWikipedia: reactTools.searchWikipedia,
    };
    const toolOrder = ["searchWikipedia", "readWebPage"] as const;

    const result = streamText({
      maxOutputTokens: 5200,
      maxRetries: 0,
      messages: await convertToModelMessages(messages, {
        ignoreIncompleteToolCalls: true,
        tools,
      }),
      model: google("gemini-3.1-flash-lite"),
      stopWhen: isStepCount(10),
      system: getCompetitorSystemPrompt(),
      temperature: 0.2,
      timeout: {
        totalMs: 60000,
      },
      toolChoice: "auto",
      toolOrder,
      tools,
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => getModelErrorMessage(error, "lite"),
    });
  } catch (error) {
    return createLocalUIMessageResponse(getModelErrorMessage(error, "lite"));
  }
}
