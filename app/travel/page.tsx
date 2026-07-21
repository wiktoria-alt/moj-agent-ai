"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";
import { TopNavigation } from "../components/TopNavigation";
import { getReadableErrorMessage } from "../lib/errors";

const travelTransport = new DefaultChatTransport({
  api: "/api/travel",
});

const scenarios = [
  "Planuję weekend w Berlinie. Budżet: 2000 PLN",
  "Lecę do Paryża na tydzień w sierpniu",
  "Wycieczka do Pragi z rodziną na 3 dni",
  "Podróż służbowa do Londynu w przyszłym tygodniu",
  "Porównaj Barcelonę i Lizbonę na wakacje",
  "Zaproponuj 6 punktów do zwiedzenia w Krakowie — interesuje mnie historia",
] as const;

const toolLabels: Record<string, { emoji: string; label: string }> = {
  calculator: { emoji: "🧮", label: "Przeliczenie" },
  getExchangeRate: { emoji: "💶", label: "Waluta" },
  getHolidays: { emoji: "📅", label: "Święta" },
  getWeather: { emoji: "🌤️", label: "Pogoda" },
  google_search: { emoji: "🌐", label: "Google" },
  searchWikipedia: { emoji: "🏛️", label: "Atrakcje" },
  suggestAttractions: { emoji: "📍", label: "Punkty do zwiedzenia" },
};

type TravelPart = {
  errorText?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
  text?: string;
  title?: string;
  toolCallId?: string;
  toolName?: string;
  type: string;
  url?: string;
};

type RenderedMessage = {
  id: string;
  role: "assistant" | "system" | "user";
  text: string;
  toolParts: TravelPart[];
};

function isToolPart(part: TravelPart) {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function getToolName(part: TravelPart) {
  if (part.type === "dynamic-tool") {
    return part.toolName ?? "tool";
  }

  return part.type.replace(/^tool-/, "");
}

function getMessageText(parts: TravelPart[]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function outputObject(part: TravelPart) {
  return typeof part.output === "object" && part.output != null
    ? (part.output as Record<string, unknown>)
    : null;
}

function valueText(value: unknown, fallback = "brak danych") {
  if (typeof value === "number") {
    return Number(value.toFixed(4)).toString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return fallback;
}

function getCardClass(name: string) {
  if (name === "getWeather") {
    return "weather";
  }

  if (name === "getExchangeRate" || name === "calculator") {
    return "currency";
  }

  if (name === "getHolidays") {
    return "holiday";
  }

  if (
    name === "suggestAttractions" ||
    name === "searchWikipedia" ||
    name === "google_search"
  ) {
    return "attraction";
  }

  return "generic";
}

function getCardTitle(part: TravelPart) {
  const name = getToolName(part);
  const details = toolLabels[name] ?? { emoji: "🔧", label: name };
  const output = outputObject(part);

  if (name === "getWeather") {
    return `${details.emoji} ${valueText(output?.city, "Pogoda")}`;
  }

  if (name === "getExchangeRate") {
    return `${details.emoji} Kurs ${valueText(output?.currency, "")}`.trim();
  }

  if (name === "getHolidays") {
    return `${details.emoji} Święta ${valueText(output?.countryCode, "")}`.trim();
  }

  if (name === "searchWikipedia") {
    return `${details.emoji} ${valueText(output?.title, "Atrakcje")}`;
  }

  if (name === "suggestAttractions") {
    return `${details.emoji} Atrakcje: ${valueText(output?.city, "miasto")}`;
  }

  return `${details.emoji} ${details.label}`;
}

function getCardBody(part: TravelPart) {
  const name = getToolName(part);
  const output = outputObject(part);

  if (part.state === "output-error") {
    return part.errorText ?? "Narzędzie zwróciło błąd.";
  }

  if (part.state !== "output-available") {
    return "Pobieram dane...";
  }

  if (typeof output?.error === "string") {
    return output.error;
  }

  if (name === "getWeather") {
    return `${valueText(output?.temperature)}°C, ${valueText(
      output?.description,
    )}. Wilgotność ${valueText(output?.humidity)}%, wiatr ${valueText(
      output?.windSpeed,
    )} km/h.`;
  }

  if (name === "getExchangeRate") {
    return `1 ${valueText(output?.currency)} = ${valueText(
      output?.rate,
    )} PLN. Źródło: ${valueText(output?.source)} (${valueText(output?.date)}).`;
  }

  if (name === "calculator") {
    return `${valueText(output?.expression)} = ${valueText(output?.result)}.`;
  }

  if (name === "getHolidays") {
    const holidays = Array.isArray(output?.holidays)
      ? (output.holidays as Array<{ date?: string; localName?: string }>).slice(0, 3)
      : [];

    if (holidays.length === 0) {
      return "Brak świąt w pobranej liście albo nie udało się ich znaleźć.";
    }

    return holidays
      .map((holiday) => `${holiday.date}: ${holiday.localName}`)
      .join(" • ");
  }

  if (name === "searchWikipedia") {
    return valueText(output?.summary).slice(0, 260);
  }

  if (name === "suggestAttractions") {
    const attractions = Array.isArray(output?.attractions)
      ? (output.attractions as Array<{ title?: string }>).slice(0, 6)
      : [];

    return attractions.length > 0
      ? attractions.map((attraction) => attraction.title).filter(Boolean).join(" • ")
      : "Nie znaleziono propozycji atrakcji.";
  }

  if (name === "google_search") {
    return valueText(output?.answer).slice(0, 260);
  }

  try {
    return JSON.stringify(part.output);
  } catch {
    return "Dane pobrane.";
  }
}

function formatArgs(input: unknown) {
  if (typeof input !== "object" || input == null || Array.isArray(input)) {
    return "";
  }

  return Object.entries(input)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${valueText(value, "")}`)
    .join(", ");
}

function TravelDataCards({ toolParts }: { toolParts: TravelPart[] }) {
  const visibleTools = toolParts.filter((part) =>
    [
      "getWeather",
      "getExchangeRate",
      "calculator",
      "getHolidays",
      "suggestAttractions",
      "searchWikipedia",
      "google_search",
    ].includes(getToolName(part)),
  );

  if (visibleTools.length === 0) {
    return null;
  }

  return (
    <section className="travel-card-grid" aria-label="Dane podróży">
      {visibleTools.map((part, index) => {
        const name = getToolName(part);
        const args = formatArgs(part.input);

        return (
          <article
            className={`travel-data-card ${getCardClass(name)}`}
            key={part.toolCallId ?? `${name}-${index}`}
          >
            <div>
              <h3>{getCardTitle(part)}</h3>
              {args && <code>{args}</code>}
            </div>
            <p>{getCardBody(part)}</p>
          </article>
        );
      })}
    </section>
  );
}

export default function TravelPage() {
  const [input, setInput] = useState("");
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [messageMetrics, setMessageMetrics] = useState<Record<string, number>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentAtRef = useRef<number | null>(null);
  const { clearError, error, messages, sendMessage, setMessages, status } =
    useChat({
      onFinish: ({ message }) => {
        const startedAt = sentAtRef.current;

        if (startedAt != null) {
          setMessageMetrics((currentMetrics) => ({
            ...currentMetrics,
            [message.id]: (Date.now() - startedAt) / 1000,
          }));
        }

        sentAtRef.current = null;
        setLiveElapsed(0);
      },
      transport: travelTransport,
    });
  const isLoading = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && !isLoading;

  const renderedMessages = useMemo<RenderedMessage[]>(
    () =>
      messages.map((message) => {
        const parts = message.parts as TravelPart[];

        return {
          id: message.id,
          role: message.role,
          text: getMessageText(parts),
          toolParts: parts.filter(isToolPart),
        };
      }),
    [messages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (!isLoading || sentAtRef.current == null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (sentAtRef.current != null) {
        setLiveElapsed((Date.now() - sentAtRef.current) / 1000);
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isLoading]);

  async function sendTravelMessage(nextText: string) {
    const text = nextText.trim();

    if (!text || isLoading) {
      return;
    }

    setInput("");
    clearError();
    sentAtRef.current = Date.now();
    setLiveElapsed(0);

    try {
      await sendMessage({ text });
    } catch {
      sentAtRef.current = null;
      clearError();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendTravelMessage(input);
  }

  function handleNewTrip() {
    clearError();
    setMessages([]);
    setMessageMetrics({});
    setLiveElapsed(0);
    sentAtRef.current = null;
  }

  const hasStreamingAssistant =
    isLoading && renderedMessages.at(-1)?.role === "assistant";
  const lastAssistantMessage = [...renderedMessages]
    .reverse()
    .find((message) => message.role === "assistant");
  const diagnosticsElapsed =
    lastAssistantMessage != null
      ? messageMetrics[lastAssistantMessage.id] ??
        (isLoading ? liveElapsed : undefined)
      : isLoading
        ? liveElapsed
        : undefined;

  return (
    <main className="chat-shell travel-shell">
      <TopNavigation className="think-nav" />

      <section className="chat-panel travel-panel" aria-label="Asystent podróży AI">
        <header className="chat-header travel-header">
          <div className="agent-lockup">
            <div className="brand-mark travel" aria-hidden="true">
              ✈️
            </div>
            <div>
              <p className="eyebrow">Travel briefing</p>
              <h1>✈️ Asystent podróży AI</h1>
              <p className="agent-description">
                Powiedz dokąd jedziesz — agent zaplanuje wszystko
              </p>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Online
          </div>
        </header>

        <section className="travel-workspace">
          <aside className="travel-scenario-panel" aria-label="Przykładowe podróże">
            {scenarios.map((scenario) => (
              <button
                disabled={isLoading}
                key={scenario}
                onClick={() => void sendTravelMessage(scenario)}
                type="button"
              >
                {scenario}
              </button>
            ))}
          </aside>

          <section className="travel-chat-column">
            <div className="messages travel-messages" aria-live="polite">
              {renderedMessages.length === 0 ? (
                <div className="empty-state">
                  <p>Opisz podróż, budżet albo poproś o porównanie miast.</p>
                </div>
              ) : (
                renderedMessages.map((message) => (
                  <article
                    className={`message ${
                      message.role === "user" ? "user" : "assistant travel-message"
                    }`}
                    key={message.id}
                  >
                    {message.role === "assistant" && (
                      <TravelDataCards toolParts={message.toolParts} />
                    )}

                    {message.text &&
                      (message.role === "assistant" ? (
                        <div className="travel-plan markdown-message">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.text}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p>{message.text}</p>
                      ))}
                  </article>
                ))
              )}

              {isLoading && !hasStreamingAssistant && (
                <article className="message assistant travel-message loading">
                  <p>Sprawdzam pogodę, waluty, święta i atrakcje...</p>
                </article>
              )}

              {error && (
                <article className="message error">
                  <p>{getReadableErrorMessage(error)}</p>
                </article>
              )}

              <div ref={bottomRef} />
            </div>

            <DiagnosticsPanel
              elapsedSeconds={diagnosticsElapsed}
              isLoading={isLoading}
              maxSteps={5}
              toolParts={lastAssistantMessage?.toolParts ?? []}
            />

            <form className="composer travel-composer" onSubmit={handleSubmit}>
              <div className="composer-row travel-composer-row">
                <input
                  aria-label="Plan podróży"
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Np. Lecę do Barcelony na weekend..."
                  value={input}
                />
                <button disabled={!canSend} type="submit">
                  Zaplanuj
                </button>
              </div>
              <div className="memory-actions travel-actions">
                <button
                  disabled={isLoading || renderedMessages.length === 0}
                  onClick={handleNewTrip}
                  type="button"
                >
                  Nowa podróż
                </button>
              </div>
            </form>
          </section>
        </section>
      </section>
    </main>
  );
}
