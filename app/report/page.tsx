"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TopNavigation } from "../components/TopNavigation";
import { getReadableErrorMessage } from "../lib/errors";

const reportTransport = new DefaultChatTransport({
  api: "/api/report",
});

const sampleTopics = [
  "Rynek AI w Polsce - trendy, firmy, prognozy na 2026",
  "Porownanie platform e-commerce: Shopify vs WooCommerce vs PrestaShop",
  "Wplyw pracy zdalnej na produktywnosc - badania i statystyki",
  "Rynek nieruchomosci w Krakowie - ceny, trendy, prognozy",
] as const;

function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function ReportPage() {
  const [topic, setTopic] = useState("");
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { clearError, error, messages, sendMessage, setMessages, status } =
    useChat({ transport: reportTransport });

  const isLoading = status === "submitted" || status === "streaming";
  const canSend = topic.trim().length > 0 && !isLoading;

  const renderedMessages = useMemo(
    () =>
      messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: getMessageText(message),
      })),
    [messages],
  );

  const latestReport = useMemo(
    () =>
      [...renderedMessages]
        .reverse()
        .find((message) => message.role === "assistant" && message.text.trim())
        ?.text.trim() ?? "",
    [renderedMessages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  async function generateReport(nextTopic: string) {
    const cleanTopic = nextTopic.trim();

    if (!cleanTopic || isLoading) {
      return;
    }

    clearError();
    setCopied(false);
    setTopic("");

    try {
      await sendMessage({ text: cleanTopic });
    } catch {
      clearError();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void generateReport(topic);
  }

  function clearReport() {
    clearError();
    setMessages([]);
    setTopic("");
    setCopied(false);
  }

  async function copyReport() {
    if (!latestReport) {
      return;
    }

    await navigator.clipboard.writeText(latestReport);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="chat-shell report-shell">
      <TopNavigation className="think-nav" />

      <section className="report-panel" aria-label="Generator raportow">
        <header className="report-header">
          <div>
            <p className="eyebrow">Agent analityczny</p>
            <h1>📊 Generator raportów</h1>
            <p className="agent-description">
              Opisz temat - agent napisze raport biznesowy z analizą, wnioskami i źródłami.
            </p>
          </div>
          <span className="report-status">
            {isLoading ? "Pracuję nad raportem" : "Gotowy"}
          </span>
        </header>

        <form className="report-form" onSubmit={handleSubmit}>
          <label htmlFor="report-topic">O czym ma być raport?</label>
          <div className="report-input-row">
            <input
              id="report-topic"
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Np. Rynek AI w Polsce w 2026 roku..."
              value={topic}
            />
            <button disabled={!canSend} type="submit">
              📊 Generuj raport
            </button>
          </div>
        </form>

        <div className="report-examples" aria-label="Przykladowe tematy">
          {sampleTopics.map((sampleTopic) => (
            <button
              disabled={isLoading}
              key={sampleTopic}
              onClick={() => void generateReport(sampleTopic)}
              type="button"
            >
              {sampleTopic}
            </button>
          ))}
        </div>

        <section className="report-result" aria-live="polite">
          {renderedMessages.length === 0 && !isLoading ? (
            <div className="report-empty">
              <p>Wpisz temat albo kliknij przykład. Gotowy raport pojawi się tutaj.</p>
            </div>
          ) : (
            renderedMessages.map((message) => (
              <article
                className={`report-message ${
                  message.role === "user" ? "user" : "assistant markdown-message"
                }`}
                key={message.id}
              >
                {message.role === "user" ? (
                  <p>{message.text}</p>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                )}
              </article>
            ))
          )}

          {isLoading && renderedMessages.at(-1)?.role !== "assistant" && (
            <article className="report-message assistant loading">
              <p>Szukam danych, analizuję źródła i składam raport...</p>
            </article>
          )}

          {error && (
            <article className="report-message error">
              <p>{getReadableErrorMessage(error)}</p>
            </article>
          )}

          <div ref={bottomRef} />
        </section>

        <footer className="report-actions">
          <button disabled={!latestReport || isLoading} onClick={copyReport} type="button">
            {copied ? "Skopiowano" : "📋 Kopiuj do schowka"}
          </button>
          <button
            disabled={isLoading || renderedMessages.length === 0}
            onClick={clearReport}
            type="button"
          >
            Nowy raport
          </button>
        </footer>
      </section>
    </main>
  );
}
