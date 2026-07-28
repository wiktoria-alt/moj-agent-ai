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

type ReportRequestBody = {
  messages: UIMessage[];
};

const enableSearchGrounding =
  process.env.ENABLE_SEARCH_GROUNDING?.toLowerCase() === "true";

function todayInPoland() {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
    timeZone: "Europe/Warsaw",
  }).format(new Date());
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

function getReportSystemPrompt() {
  const currentDate = todayInPoland();
  const searchInstruction = enableSearchGrounding
    ? "- Używaj google_search do aktualnych informacji i źródeł branżowych."
    : "- Google Search grounding jest wyłączony. Używaj searchWikipedia, readWebPage dla podanych adresów URL i wyraźnie zaznacz, gdy brakuje aktualnych źródeł.";

  return `Jesteś profesjonalnym analitykiem biznesowym. Gdy użytkownik poda temat,
AUTONOMICZNIE zbierasz informacje i piszesz raport.

Dzisiejsza data: ${currentDate}.

## TWÓJ PROCES:
1. Przeanalizuj temat - co trzeba zbadać?
2. Szukaj danych: Google Search, Wikipedia, strony branżowe
3. Zbierz fakty, liczby, statystyki
4. Napisz raport w profesjonalnym formacie

## FORMAT RAPORTU:

# 📊 Raport: [TEMAT]
Data: ${currentDate}
Autor: Agent AI

## Streszczenie (Executive Summary)
[3-4 zdania - kluczowe wnioski]

## 1. Wprowadzenie
[Kontekst, dlaczego ten temat jest ważny]

## 2. Kluczowe dane i fakty
[Wylistowane punkty z danymi - ze źródłami]

## 3. Analiza
[Interpretacja danych, trendy, porównania]

## 4. Wnioski i rekomendacje
[Co z tego wynika? Co robić?]

## Źródła
[Lista użytych źródeł z linkami]

ZASADY:
- Używaj prawdziwych danych z narzędzi.
${searchInstruction}
- Podawaj źródła przy każdym fakcie.
- Bądź konkretny - liczby, daty, nazwy.
- Raport powinien mieć 500-1000 słów.
- Nie wymyślaj statystyk - szukaj albo napisz, że nie udało się potwierdzić danych.
- Odpowiadaj po polsku.`;
}

export async function POST(req: Request) {
  const { messages }: ReportRequestBody = await req.json();

  try {
    if (enableSearchGrounding) {
      const tools = {
        calculator: reactTools.calculator,
        google_search: reactTools.google_search,
        readWebPage: reactTools.readWebPage,
        searchWikipedia: reactTools.searchWikipedia,
      };
      const toolOrder = [
        "google_search",
        "searchWikipedia",
        "readWebPage",
        "calculator",
      ] as const;

      const result = streamText({
        maxOutputTokens: 5200,
        maxRetries: 0,
        messages: await convertToModelMessages(messages, {
          ignoreIncompleteToolCalls: true,
          tools,
        }),
        model: google("gemini-3.1-flash-lite"),
        stopWhen: isStepCount(8),
        system: getReportSystemPrompt(),
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
      calculator: reactTools.calculator,
      readWebPage: reactTools.readWebPage,
      searchWikipedia: reactTools.searchWikipedia,
    };
    const toolOrder = ["searchWikipedia", "readWebPage", "calculator"] as const;

    const result = streamText({
      maxOutputTokens: 5200,
      maxRetries: 0,
      messages: await convertToModelMessages(messages, {
        ignoreIncompleteToolCalls: true,
        tools,
      }),
      model: google("gemini-3.1-flash-lite"),
      stopWhen: isStepCount(8),
      system: getReportSystemPrompt(),
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
