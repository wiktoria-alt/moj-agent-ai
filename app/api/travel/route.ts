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

const travelToolOrder = [
  "getWeather",
  "getExchangeRate",
  "getHolidays",
  "suggestAttractions",
  "searchWikipedia",
  "calculator",
  "google_search",
  "currentDateTime",
  "readWebPage",
  "saveNote",
  "getNotes",
] as const satisfies ReadonlyArray<keyof typeof reactTools & string>;

const travelSystemPrompt = `Jesteś profesjonalnym asystentem podróży. Gdy użytkownik opisuje
planowaną podróż, AUTONOMICZNIE zbierasz wszystkie potrzebne informacje.

## TWÓJ PROCES:

Dla każdej podróży MUSISZ sprawdzić:
1. 🌤️ Pogodę w miejscu docelowym (getWeather)
2. 💶 Kurs lokalnej waluty (getExchangeRate)
3. 📅 Dni wolne/święta w kraju docelowym (getHolidays)
4. 🏛️ Sugestie punktów do zwiedzenia (suggestAttractions)
5. 📖 Informacje o mieście (searchWikipedia)
6. 🧮 Przeliczenie budżetu jeśli podany (calculator)

Jeśli użytkownik prosi o porównanie dwóch miast, sprawdź pogodę, waluty, święta i informacje o mieście dla OBU miejsc, a potem przygotuj tabelę porównawczą i rekomendację.

Po zebraniu danych, wygeneruj GOTOWY PLAN w formacie:

## 🗺️ Plan podróży: [MIASTO]

### 📋 Podsumowanie
- Destynacja: [miasto, kraj]
- Pogoda: [temperatura, opis]
- Waluta: [kurs, ile PLN = 1 lokalna waluta]

### 🌤️ Pogoda
[Szczegóły pogody + co spakować]

### 💰 Budżet
[Przeliczenia walutowe, orientacyjne koszty]

### 📅 Ważne daty
[Święta, dni wolne — co może być zamknięte?]

### 🏛️ Co zobaczyć
[Na podstawie Wikipedii i Google — główne atrakcje]

### ✅ Checklist przed wyjazdem
[Lista rzeczy do zrobienia/spakowania]

## ZASADY:
- Używaj PRAWDZIWYCH danych z narzędzi — nie zgaduj
- Jeśli narzędzie zwróci błąd — poinformuj i kontynuuj
- Bądź praktyczny — konkretne rady, nie ogólniki
- Podawaj ceny w PLN oraz po przeliczeniu po aktualnym kursie
- Dla waluty wybierz typową walutę kraju docelowego, np. DE/FR/ES/PT/AT: EUR, GB: GBP, CZ: CZK, JP: JPY, US: USD
- Dla świąt wybierz kod kraju docelowego, np. Niemcy DE, Francja FR, Czechy CZ, Japonia JP
- Gdy użytkownik pyta co zobaczyć lub planuje pobyt w mieście, użyj suggestAttractions i oprzyj rekomendacje na zwróconych wynikach
- Gdy potrzebujesz aktualnych informacji spoza pogody/walut/świąt/Wikipedii, użyj google_search
- Odpowiadaj po polsku.

## OBSŁUGA BŁĘDÓW:
- Jeśli narzędzie zwróci błąd — NIE powtarzaj tego samego wywołania
- Zamiast tego: poinformuj użytkownika i zaproponuj alternatywę
- Przykład: jeśli pogoda nie działa → "Nie udało się sprawdzić pogody w X. Mogę poszukać w Google lub spróbować innego miasta."
- NIGDY nie wywołuj tego samego narzędzia z tymi samymi argumentami dwa razy z rzędu
- Jeśli po 3 nieudanych próbach nie masz danych — powiedz wprost czego brakuje`;

type TravelRequestBody = {
  messages: UIMessage[];
};

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

function getForcedFirstTool(taskText: string): keyof typeof reactTools & string {
  const normalized = normalizeTaskText(taskText);

  if (/\b(atrakcj[a-z]*|zwiedz[a-z]*|zobaczyc|odwiedzic|punkt[a-z]*.{0,3}turyst[a-z]*)\b/.test(normalized)) {
    return "suggestAttractions";
  }

  if (/\b(budzet|budget|pln|eur|euro|gbp|funt|czk|koron|jpy|jen|usd|dolar)\b/.test(normalized)) {
    return "getExchangeRate";
  }

  if (/\b(porownaj|porównaj|vs|czy lepiej)\b/.test(taskText.toLowerCase())) {
    return "getWeather";
  }

  return "getWeather";
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
  const { messages }: TravelRequestBody = await req.json();
  const forcedFirstTool = getForcedFirstTool(getLastUserText(messages));

  try {
    const result = streamText({
      maxOutputTokens: 5200,
      maxRetries: 0,
      messages: await convertToModelMessages(messages, {
        ignoreIncompleteToolCalls: true,
        tools: reactTools,
      }),
      model: google("gemini-2.5-flash"),
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0
          ? {
              activeTools: [forcedFirstTool],
              toolChoice: { toolName: forcedFirstTool, type: "tool" },
              toolOrder: [forcedFirstTool],
            }
          : {
              toolChoice: "auto",
              toolOrder: travelToolOrder,
            },
      stopWhen: isStepCount(10),
      system: travelSystemPrompt,
      temperature: 0.2,
      timeout: {
        totalMs: 60000,
      },
      toolChoice: { toolName: forcedFirstTool, type: "tool" },
      toolOrder: travelToolOrder,
      tools: reactTools,
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => getModelErrorMessage(error, "flash"),
    });
  } catch (error) {
    return createLocalUIMessageResponse(getModelErrorMessage(error, "flash"));
  }
}
