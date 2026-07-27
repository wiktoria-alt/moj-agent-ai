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

type MealPlannerRequestBody = {
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

function getMealPlannerSystemPrompt() {
  const searchInstruction = enableSearchGrounding
    ? "- Używaj google_search, gdy potrzebujesz aktualnych orientacyjnych cen, inspiracji sezonowych albo informacji dietetycznych."
    : "- Google Search grounding jest wyłączony. Korzystaj z kalkulatora do kosztów i wyraźnie zaznacz, że ceny są orientacyjne.";

  return `Jesteś praktycznym dietetyczno-kulinarnym asystentem do planowania posiłków.
Użytkownik podaje preferencje, ograniczenia, budżet i liczbę dni. Twoim zadaniem jest ułożyć realistyczny plan jedzenia, który da się faktycznie zrobić.

## TWÓJ PROCES:
1. Zrozum cel: dieta, liczba osób, dni, budżet, wykluczenia, czas gotowania.
2. Ułóż jadłospis z prostych składników i sensownym wykorzystaniem resztek.
3. Oszacuj koszty. Użyj calculator do sum i kosztu dziennego.
4. Przygotuj listę zakupów pogrupowaną kategoriami.
5. Dodaj krótkie przepisy i wskazówki meal-prep.

## FORMAT ODPOWIEDZI:

# 🍽️ Planer posiłków

## Założenia
[krótko: dni, osoby, budżet, preferencje, ograniczenia]

## Jadłospis
| Dzień | Śniadanie | Obiad | Kolacja | Przekąska |
|------|-----------|-------|---------|-----------|

## Lista zakupów
[Pogrupuj: warzywa/owoce, białko, produkty suche, nabiał/zamienniki, przyprawy i dodatki]

## Szacunkowy koszt
- Koszt całości: [kwota]
- Koszt dziennie: [kwota]
- Najdroższe składniki: [lista]
- Jak obniżyć koszt: [2-4 porady]

## Szybkie przepisy
[Krótko opisz przygotowanie głównych dań]

## Meal-prep
[Co ugotować wcześniej, co przechowywać, co zjeść najpierw]

## Uwagi zdrowotne
[Krótka, rozsądna informacja: to nie jest porada medyczna; przy chorobach skonsultować dietę]

ZASADY:
- Nie układaj ekstremalnych diet ani nie obiecuj efektów zdrowotnych.
- Jeśli użytkownik poda alergie, traktuj je jako twarde wykluczenia.
- Pilnuj budżetu i prostoty.
- Podawaj praktyczne zamienniki.
- Odpowiadaj po polsku.
${searchInstruction}`;
}

export async function POST(req: Request) {
  const { messages }: MealPlannerRequestBody = await req.json();

  try {
    if (enableSearchGrounding) {
      const tools = {
        calculator: reactTools.calculator,
        google_search: reactTools.google_search,
        searchWikipedia: reactTools.searchWikipedia,
      };
      const toolOrder = ["calculator", "google_search", "searchWikipedia"] as const;

      const result = streamText({
        maxOutputTokens: 5200,
        maxRetries: 0,
        messages: await convertToModelMessages(messages, {
          ignoreIncompleteToolCalls: true,
          tools,
        }),
        model: google("gemini-3.1-flash-lite"),
        stopWhen: isStepCount(8),
        system: getMealPlannerSystemPrompt(),
        temperature: 0.35,
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
      calculator: reactTools.calculator,
      searchWikipedia: reactTools.searchWikipedia,
    };
    const toolOrder = ["calculator", "searchWikipedia"] as const;

    const result = streamText({
      maxOutputTokens: 5200,
      maxRetries: 0,
      messages: await convertToModelMessages(messages, {
        ignoreIncompleteToolCalls: true,
        tools,
      }),
      model: google("gemini-3.1-flash-lite"),
      stopWhen: isStepCount(8),
      system: getMealPlannerSystemPrompt(),
      temperature: 0.35,
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
