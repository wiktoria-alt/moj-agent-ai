"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";
import { TopNavigation } from "../components/TopNavigation";
import { getReadableErrorMessage } from "../lib/errors";

const reactTransport = new DefaultChatTransport({
  api: "/api/react",
});

const scenarios = [
  "Planuję weekend w Krakowie. Sprawdź pogodę, znajdź ciekawe miejsca w Wikipedii, i powiedz czy są jakieś święta w ten weekend",
  "Mam 5000 EUR do wydania. Przelicz na PLN, sprawdź ile to w dolarach, i zapisz wszystkie kursy w notatkach",
  "Porównaj pogodę w Warszawie, Berlinie i Paryżu. Który z tych miast ma dziś najlepszą pogodę?",
  "Ile dni do następnego święta w Polsce? Jaka będzie wtedy pogoda?",
] as const;

const toolDetails: Record<string, { emoji: string; label: string }> = {
  calculator: { emoji: "🧮", label: "Kalkulator" },
  currentDateTime: { emoji: "🕐", label: "Data i czas" },
  getExchangeRate: { emoji: "💱", label: "Kurs waluty" },
  getHolidays: { emoji: "📅", label: "Święta" },
  getNotes: { emoji: "🗒️", label: "Notatki" },
  getWeather: { emoji: "🌦️", label: "Pogoda" },
  google_search: { emoji: "🌐", label: "Google Search" },
  readWebPage: { emoji: "📄", label: "Czytanie strony" },
  saveNote: { emoji: "💾", label: "Zapis notatki" },
  searchWikipedia: { emoji: "📚", label: "Wikipedia" },
};

type ReactPart = {
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
  parts: ReactPart[];
  role: "assistant" | "system" | "user";
  sources: ReactPart[];
  text: string;
  toolParts: ReactPart[];
};

type ReactTextBlock = {
  content: string;
  kind: "observation" | "result" | "text" | "thought";
  title: string;
};

function isToolPart(part: ReactPart) {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function getToolName(part: ReactPart) {
  if (part.type === "dynamic-tool") {
    return part.toolName ?? "tool";
  }

  return part.type.replace(/^tool-/, "");
}

function getMessageText(parts: ReactPart[]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function shorten(text: string, maxLength = 180) {
  const cleanText = text.replace(/\s+/g, " ").trim();

  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  return `${cleanText.slice(0, maxLength - 1)}…`;
}

function valueToPreview(value: unknown, maxLength = 180): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return shorten(value, maxLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return shorten(JSON.stringify(value) ?? "", maxLength);
  } catch {
    return "[wynik]";
  }
}

function formatArgs(input: unknown) {
  if (input == null) {
    return "";
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    return valueToPreview(input, 120);
  }

  return Object.entries(input)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${valueToPreview(value, 90)}`)
    .join(", ");
}

function getOutputObject(output: unknown) {
  return typeof output === "object" && output != null
    ? (output as Record<string, unknown>)
    : null;
}

function getToolSummary(part: ReactPart) {
  const name = getToolName(part);
  const outputObject = getOutputObject(part.output);

  if (part.state === "output-error") {
    return part.errorText ?? "Narzędzie zwróciło błąd.";
  }

  if (part.state === "output-denied") {
    return "Wywołanie narzędzia zostało zatrzymane.";
  }

  if (part.state !== "output-available") {
    return "W trakcie wykonywania...";
  }

  if (typeof outputObject?.error === "string") {
    return outputObject.error;
  }

  if (name === "calculator") {
    return `${valueToPreview(outputObject?.expression)} = ${valueToPreview(
      outputObject?.result,
    )}`;
  }

  if (name === "currentDateTime") {
    return valueToPreview(outputObject?.dateTime ?? part.output);
  }

  if (name === "getWeather") {
    return `${valueToPreview(outputObject?.city)}: ${valueToPreview(
      outputObject?.temperature,
    )}°C, ${valueToPreview(outputObject?.description)}, wiatr ${valueToPreview(
      outputObject?.windSpeed,
    )} km/h`;
  }

  if (name === "getExchangeRate") {
    return `1 ${valueToPreview(outputObject?.currency)} = ${valueToPreview(
      outputObject?.rate,
    )} PLN (${valueToPreview(outputObject?.date ?? outputObject?.source)})`;
  }

  if (name === "getHolidays") {
    const holidays = Array.isArray(outputObject?.holidays)
      ? outputObject.holidays.length
      : 0;

    return `${holidays} świąt dla ${valueToPreview(
      outputObject?.countryCode,
    )} w roku ${valueToPreview(outputObject?.year)}.`;
  }

  if (name === "searchWikipedia") {
    return `${valueToPreview(outputObject?.title)} — ${valueToPreview(
      outputObject?.summary,
      240,
    )}`;
  }

  if (name === "saveNote") {
    return `Zapisano notatkę: ${valueToPreview(outputObject?.title)}.`;
  }

  if (name === "getNotes" && Array.isArray(part.output)) {
    return `Pobrano notatki: ${part.output.length}.`;
  }

  if (name === "google_search") {
    return valueToPreview(outputObject?.answer ?? part.output, 260);
  }

  return valueToPreview(part.output);
}

function getBlockKind(title: string): ReactTextBlock["kind"] {
  if (title.includes("🧠")) {
    return "thought";
  }

  if (title.includes("👁")) {
    return "observation";
  }

  if (title.includes("✅")) {
    return "result";
  }

  return "text";
}

function parseReactText(text: string): ReactTextBlock[] {
  const matches = Array.from(
    text.matchAll(/(?:^|\n)(?:###\s*)?((?:🧠|👁️?|✅)[^\n]*)\n?/g),
  );

  if (matches.length === 0) {
    return text.trim()
      ? [
          {
            content: text,
            kind: "text",
            title: "Odpowiedź",
          },
        ]
      : [];
  }

  const blocks: ReactTextBlock[] = [];
  const firstMatchIndex = matches[0].index ?? 0;
  const prefix = text.slice(0, firstMatchIndex).trim();

  if (prefix) {
    blocks.push({
      content: prefix,
      kind: "text",
      title: "Odpowiedź",
    });
  }

  matches.forEach((match, index) => {
    const title = match[1].trim();
    const contentStart = (match.index ?? 0) + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? text.length;
    const content = text.slice(contentStart, contentEnd).trim();

    blocks.push({
      content,
      kind: getBlockKind(title),
      title,
    });
  });

  return blocks;
}

function countReactSections(text: string) {
  return Array.from(text.matchAll(/(?:^|\n)(?:###\s*)?(?:🧠|👁️?|✅)/g)).length;
}

function getReactProgress(parts: ReactPart[], isCurrentAssistant: boolean) {
  const text = getMessageText(parts);
  const hasResult = text.includes("✅");
  const signalCount = countReactSections(text) + parts.filter(isToolPart).length;

  if (hasResult && !isCurrentAssistant) {
    return 5;
  }

  return Math.min(5, Math.max(1, Math.ceil(signalCount / 2)));
}

function ReactProgress({
  currentStep,
  isLoading,
}: {
  currentStep: number;
  isLoading: boolean;
}) {
  return (
    <div className="react-progress" aria-label={`Krok ${currentStep} z 5`}>
      <div className="react-progress-heading">
        <span>Krok {currentStep} z 5</span>
        <strong>{isLoading ? "działam" : "gotowe"}</strong>
      </div>
      <div className="react-progress-track" aria-hidden="true">
        <span style={{ width: `${(currentStep / 5) * 100}%` }} />
      </div>
    </div>
  );
}

function ReactTextBlocks({ text }: { text: string }) {
  const blocks = parseReactText(text);

  return (
    <>
      {blocks.map((block, index) => (
        <section
          className={`react-step-card ${block.kind}`}
          key={`${block.kind}-${index}-${block.title}`}
        >
          <h3>{block.title}</h3>
          {block.content && (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {block.content}
            </ReactMarkdown>
          )}
        </section>
      ))}
    </>
  );
}

function ReactToolCard({ part }: { part: ReactPart }) {
  const name = getToolName(part);
  const details = toolDetails[name] ?? { emoji: "🔧", label: name };
  const args = formatArgs(part.input);
  const isRunning =
    part.state !== "output-available" &&
    part.state !== "output-error" &&
    part.state !== "output-denied";

  return (
    <section className={`react-tool-card ${isRunning ? "running" : ""}`}>
      <div className="react-tool-icon" aria-hidden="true">
        ⚡
      </div>
      <div className="react-tool-body">
        <div className="react-tool-title">
          <span aria-hidden="true">{details.emoji}</span>
          <strong>{details.label}</strong>
          {args && <code>({args})</code>}
        </div>
        <p>{getToolSummary(part)}</p>
      </div>
    </section>
  );
}

function SourceLinks({ sources }: { sources: ReactPart[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="agent-sources react-sources" aria-label="Źródła">
      {sources.slice(0, 6).map((source, index) => (
        <a href={source.url} key={`${source.url}-${index}`} rel="noreferrer" target="_blank">
          {source.title || source.url}
        </a>
      ))}
    </div>
  );
}

export default function ReactPage() {
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
      transport: reactTransport,
    });
  const isLoading = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && !isLoading;

  const renderedMessages = useMemo<RenderedMessage[]>(
    () =>
      messages.map((message) => {
        const parts = message.parts as ReactPart[];

        return {
          id: message.id,
          parts,
          role: message.role,
          sources: parts.filter((part) => part.type === "source-url" && part.url),
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

  async function sendReactMessage(nextText: string) {
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
    void sendReactMessage(input);
  }

  function handleNewTask() {
    clearError();
    setMessages([]);
    setMessageMetrics({});
    setLiveElapsed(0);
    sentAtRef.current = null;
  }

  const lastAssistantId = [...renderedMessages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;
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
    <main className="chat-shell react-shell">
      <TopNavigation className="think-nav" />

      <section className="chat-panel react-panel" aria-label="Agent ReAct">
        <header className="chat-header react-header">
          <div className="agent-lockup">
            <div className="brand-mark react" aria-hidden="true">
              🔄
            </div>
            <div>
              <p className="eyebrow">ReAct loop</p>
              <h1>🔄 Agent ReAct — Autonomiczne rozumowanie</h1>
              <p className="agent-description">
                Opisz cel → agent sam planuje i realizuje
              </p>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Online
          </div>
        </header>

        <section className="react-workspace">
          <aside className="react-scenario-panel" aria-label="Scenariusze ReAct">
            {scenarios.map((scenario) => (
              <button
                disabled={isLoading}
                key={scenario}
                onClick={() => void sendReactMessage(scenario)}
                type="button"
              >
                {scenario}
              </button>
            ))}
          </aside>

          <section className="react-chat-column">
            <div className="messages react-messages" aria-live="polite">
              {renderedMessages.length === 0 ? (
                <div className="empty-state">
                  <p>Podaj cel albo wybierz gotowy scenariusz.</p>
                </div>
              ) : (
                renderedMessages.map((message) => {
                  const isAssistant = message.role === "assistant";
                  const isCurrentAssistant =
                    isAssistant && isLoading && message.id === lastAssistantId;
                  const currentStep = getReactProgress(
                    message.parts,
                    isCurrentAssistant,
                  );

                  return (
                    <article
                      className={`message ${
                        message.role === "user" ? "user" : "assistant react-message"
                      }`}
                      key={message.id}
                    >
                      {isAssistant && (
                        <ReactProgress
                          currentStep={currentStep}
                          isLoading={isCurrentAssistant}
                        />
                      )}

                      {message.parts.map((part, index) => {
                        if (part.type === "text") {
                          return (
                            <ReactTextBlocks
                              key={`${message.id}-text-${index}`}
                              text={part.text ?? ""}
                            />
                          );
                        }

                        if (isToolPart(part)) {
                          return (
                            <ReactToolCard
                              key={
                                part.toolCallId ?? `${message.id}-tool-${index}`
                              }
                              part={part}
                            />
                          );
                        }

                        return null;
                      })}

                      {isAssistant && <SourceLinks sources={message.sources} />}

                      {isAssistant && (
                        <p className="agent-metrics react-metrics">
                          Narzędzia: {message.toolParts.length} | Sekcje:{" "}
                          {countReactSections(message.text)}
                        </p>
                      )}
                    </article>
                  );
                })
              )}

              {isLoading && !hasStreamingAssistant && (
                <article className="message assistant react-message loading">
                  <ReactProgress currentStep={1} isLoading />
                  <p>Uruchamiam pętlę ReAct...</p>
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

            <form className="composer react-composer" onSubmit={handleSubmit}>
              <div className="composer-row react-composer-row">
                <input
                  aria-label="Cel dla agenta ReAct"
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Opisz co chcesz osiągnąć..."
                  value={input}
                />
                <button disabled={!canSend} type="submit">
                  Wyślij
                </button>
              </div>
              <div className="memory-actions react-actions">
                <button
                  disabled={isLoading || renderedMessages.length === 0}
                  onClick={handleNewTask}
                  type="button"
                >
                  Nowe zadanie
                </button>
              </div>
            </form>
          </section>
        </section>
      </section>
    </main>
  );
}
