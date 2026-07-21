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

const reactSystemPrompt = `Jesteś autonomicznym agentem. Gdy dostajesz ZADANIE (nie pytanie),
MUSISZ je zrealizować krok po kroku.

## TWÓJ PROCES:

Dla KAŻDEGO kroku wypisz:

### 🧠 Myślę...
Co muszę teraz zrobić? Jakie informacje mi brakuje?
Które narzędzie użyć?

Potem UŻYJ narzędzia.

Po otrzymaniu wyniku:

### 👁️ Obserwuję...
Co dostałem? Czy to wystarczy do odpowiedzi?
Jeśli nie — jaki następny krok?

Powtarzaj aż będziesz mieć WSZYSTKO co potrzebne.

Na koniec:

### ✅ Wynik końcowy
Podaj pełną, konkretną odpowiedź opartą na zebranych danych.
Cytuj źródła (API, Wikipedia, Google).

## ZASADY:
- ZAWSZE pokazuj tok myślenia — użytkownik widzi cały proces
- Nagłówki sekcji pisz dokładnie jako markdown:
  - ### 🧠 Myślę...
  - ### 👁️ Obserwuję...
  - ### ✅ Wynik końcowy
- NIE zgaduj — jeśli potrzebujesz danych, UŻYJ narzędzia
- Maksymalnie 5 głównych kroków
- Jeśli narzędzie zwróci błąd — spróbuj inaczej lub poinformuj
- ŁĄCZ dane z wielu narzędzi w spójną odpowiedź
- Gdy istnieje dedykowane narzędzie API, użyj go przed Google Search:
  - pogoda → getWeather
  - kursy walut → getExchangeRate
  - obliczenia → calculator
  - data i czas → currentDateTime
  - święta → getHolidays
  - definicje encyklopedyczne → searchWikipedia
  - zapisywanie/pobieranie pamięci → saveNote/getNotes
- Google Search stosuj dopiero do informacji aktualnych, których nie obsługuje dedykowane API.
- Odpowiadaj po polsku i trzymaj wynik praktyczny.

## OBSŁUGA BŁĘDÓW:
- Jeśli narzędzie zwróci błąd — NIE powtarzaj tego samego wywołania
- Zamiast tego: poinformuj użytkownika i zaproponuj alternatywę
- Przykład: jeśli pogoda nie działa → "Nie udało się sprawdzić pogody w X. Mogę poszukać w Google lub spróbować innego miasta."
- NIGDY nie wywołuj tego samego narzędzia z tymi samymi argumentami dwa razy z rzędu
- Jeśli po 3 nieudanych próbach nie masz danych — powiedz wprost czego brakuje`;

type ReactRequestBody = {
  messages: UIMessage[];
};

const reactToolOrder = [
  "getWeather",
  "getExchangeRate",
  "getHolidays",
  "searchWikipedia",
  "calculator",
  "currentDateTime",
  "saveNote",
  "getNotes",
  "readWebPage",
  "google_search",
] as const satisfies ReadonlyArray<keyof typeof reactTools & string>;

type ReactToolName = (typeof reactToolOrder)[number];

function getMessageText(message: UIMessage) {
  return ((message.parts ?? []) as Array<{ type?: string; text?: unknown }>)
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? ""))
    .join("");
}

function getLastUserText(messages: UIMessage[]) {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");

  return lastUserMessage ? getMessageText(lastUserMessage) : "";
}

function normalizeTaskText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function getForcedFirstTool(taskText: string): ReactToolName | null {
  const normalized = normalizeTaskText(taskText);

  if (/https?:\/\//.test(normalized)) {
    return "readWebPage";
  }

  if (/\b(pogod|temperatur|wiatr|wilgotn|deszcz|slonecz)\b/.test(normalized)) {
    return "getWeather";
  }

  if (/\b(kurs|walut|eur|euro|usd|dolar|gbp|funt|chf|frank|pln)\b/.test(normalized)) {
    return "getExchangeRate";
  }

  if (/\b(swiet|holiday|wolne)\b/.test(normalized) && /\b(ile dni|nastepn)\b/.test(normalized)) {
    return "currentDateTime";
  }

  if (/\b(swiet|holiday|wolne)\b/.test(normalized)) {
    return "getHolidays";
  }

  if (/\b(dzis|dzisiaj|teraz|aktualn|dzien tygodnia|ile dni)\b/.test(normalized)) {
    return "currentDateTime";
  }

  if (/\b(pobierz|pokaz|wyswietl).*notat/.test(normalized)) {
    return "getNotes";
  }

  if (/\b(notat|zapisz|zapamietaj)\b/.test(normalized)) {
    return "saveNote";
  }

  if (/\b(wikipedia|czym jest|definic|encyklop)\b/.test(normalized)) {
    return "searchWikipedia";
  }

  if (/\b(najnowsz|wiadomosc|news|trendy|zastosowan|aktualne informacje)\b/.test(normalized)) {
    return "google_search";
  }

  if (/\b(oblicz|policz|ile to|procent|%)\b/.test(normalized)) {
    return "calculator";
  }

  return null;
}

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

export async function POST(req: Request) {
  const { messages }: ReactRequestBody = await req.json();
  const forcedFirstTool = getForcedFirstTool(getLastUserText(messages));

  try {
    const result = streamText({
      maxOutputTokens: 4200,
      maxRetries: 0,
      messages: await convertToModelMessages(messages, {
        ignoreIncompleteToolCalls: true,
        tools: reactTools,
      }),
      model: google("gemini-2.5-flash"),
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0 && forcedFirstTool
          ? {
              activeTools: [forcedFirstTool],
              toolChoice: { toolName: forcedFirstTool, type: "tool" },
              toolOrder: [forcedFirstTool],
            }
          : {
              toolChoice: "auto",
              toolOrder: reactToolOrder,
            },
      stopWhen: isStepCount(8),
      system: reactSystemPrompt,
      temperature: 0.2,
      timeout: {
        totalMs: 60000,
      },
      toolChoice: forcedFirstTool
        ? { toolName: forcedFirstTool, type: "tool" }
        : "auto",
      toolOrder: reactToolOrder,
      tools: reactTools,
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => getModelErrorMessage(error, "flash"),
    });
  } catch (error) {
    return createLocalUIMessageResponse(getModelErrorMessage(error, "flash"));
  }
}
