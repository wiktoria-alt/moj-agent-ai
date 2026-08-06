"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TopNavigation } from "../components/TopNavigation";
import { getReadableErrorMessage } from "../lib/errors";

const competitorTransport = new DefaultChatTransport({
  api: "/api/competitor",
});

const examples = [
  {
    companies: ["Shopify", "WooCommerce", "PrestaShop"],
    context: "Szukam platformy e-commerce dla małego sklepu.",
    label: "Shopify vs WooCommerce vs PrestaShop",
  },
  {
    companies: ["Notion", "Obsidian", "Evernote"],
    context: "Szukam narzędzia do notatek i bazy wiedzy dla małego zespołu.",
    label: "Notion vs Obsidian vs Evernote",
  },
  {
    companies: ["Vercel", "Netlify", "Railway"],
    context: "Porównuję hosting dla aplikacji Next.js.",
    label: "Vercel vs Netlify vs Railway",
  },
  {
    companies: ["ChatGPT", "Claude", "Gemini"],
    context: "Chcę wybrać asystenta AI do pracy biznesowej.",
    label: "ChatGPT vs Claude vs Gemini",
  },
] as const;

const skdExamples = [
  {
    companies: ["Alior Bank", "Santander", "PKO BP"],
    context: "Porównuję komunikację banków i dokumenty kredytu konsumenckiego pod kątem ryzyk SKD.",
    label: "Alior vs Santander vs PKO BP",
  },
  {
    companies: ["mBank", "ING", "BNP Paribas"],
    context: "Chcę porównać, jak banki opisują koszty kredytu i wcześniejszą spłatę.",
    label: "mBank vs ING vs BNP Paribas",
  },
  {
    companies: ["UOKiK", "Rzecznik Finansowy", "Sąd Najwyższy"],
    context: "Porównuję źródła wiedzy przy analizie sankcji kredytu darmowego.",
    label: "UOKiK vs RF vs SN",
  },
  {
    companies: ["Kancelaria SKD", "Doradca finansowy", "Agent AI SKD"],
    context: "Porównuję sposoby wstępnej analizy umowy kredytu konsumenckiego.",
    label: "Kancelaria vs doradca vs agent",
  },
] as const;

function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function buildPrompt(companies: string[], context: string) {
  const [first, second, third] = companies;
  const contextLine = context.trim()
    ? `\nKontekst użytkownika: ${context.trim()}`
    : "";

  return `Porównaj firmy: ${first}, ${second}, ${third}.${contextLine}`;
}

export default function CompetitorPage() {
  const [companies, setCompanies] = useState(["", "", ""]);
  const [context, setContext] = useState("");
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { clearError, error, messages, sendMessage, setMessages, status } =
    useChat({ transport: competitorTransport });

  const isLoading = status === "submitted" || status === "streaming";
  const canSend = companies.every((company) => company.trim().length > 0) && !isLoading;

  const renderedMessages = useMemo(
    () =>
      messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: getMessageText(message),
      })),
    [messages],
  );

  const latestAnalysis = useMemo(
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

  function updateCompany(index: number, value: string) {
    setCompanies((current) =>
      current.map((company, companyIndex) =>
        companyIndex === index ? value : company,
      ),
    );
  }

  async function compareCompanies(nextCompanies = companies, nextContext = context) {
    const cleanCompanies = nextCompanies.map((company) => company.trim());

    if (cleanCompanies.some((company) => !company) || isLoading) {
      return;
    }

    clearError();
    setCopied(false);

    try {
      await sendMessage({ text: buildPrompt(cleanCompanies, nextContext) });
    } catch {
      clearError();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void compareCompanies();
  }

  function useExample(example: (typeof skdExamples)[number]) {
    setCompanies([...example.companies]);
    setContext(example.context);
    void compareCompanies([...example.companies], example.context);
  }

  function clearAnalysis() {
    clearError();
    setMessages([]);
    setCopied(false);
  }

  async function copyAnalysis() {
    if (!latestAnalysis) {
      return;
    }

    await navigator.clipboard.writeText(latestAnalysis);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="chat-shell competitor-shell">
      <TopNavigation className="think-nav" />

      <section className="competitor-panel" aria-label="Analiza konkurencji">
        <header className="competitor-header">
          <div>
            <p className="eyebrow">Agent strategiczny</p>
            <h1>🏢 Analiza konkurencji</h1>
            <p className="agent-description">
              Podaj firmy - agent porówna je za Ciebie.
            </p>
          </div>
          <span className="competitor-status">
            {isLoading ? "Analizuję konkurencję" : "Gotowy"}
          </span>
        </header>

        <form className="competitor-form" onSubmit={handleSubmit}>
          <div className="competitor-input-grid">
            {["Firma 1", "Firma 2", "Firma 3"].map((label, index) => (
              <label key={label}>
                <span>{label}</span>
                <input
                  onChange={(event) => updateCompany(index, event.target.value)}
                  placeholder={
                    index === 0
                      ? "Np. Alior Bank"
                      : index === 1
                        ? "Np. Santander"
                        : "Np. PKO BP"
                  }
                  value={companies[index]}
                />
              </label>
            ))}
          </div>

          <label className="competitor-context">
            <span>Kontekst</span>
            <textarea
              onChange={(event) => setContext(event.target.value)}
              placeholder="Np. Porównuję komunikację banków pod kątem ryzyk SKD..."
              value={context}
            />
          </label>

          <button className="competitor-submit" disabled={!canSend} type="submit">
            🔍 Porównaj
          </button>
        </form>

        <div className="competitor-examples" aria-label="Przykładowe porównania">
          {skdExamples.map((example) => (
            <button
              disabled={isLoading}
              key={example.label}
              onClick={() => useExample(example)}
              type="button"
            >
              {example.label}
            </button>
          ))}
        </div>

        <section className="competitor-result" aria-live="polite">
          {renderedMessages.length === 0 && !isLoading ? (
            <div className="competitor-empty">
              <p>Wpisz trzy firmy albo kliknij przykład. Analiza pojawi się tutaj.</p>
            </div>
          ) : (
            renderedMessages.map((message) => (
              <article
                className={`competitor-message ${
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
            <article className="competitor-message assistant loading">
              <p>Szukam informacji, porównuję firmy i składam rekomendację...</p>
            </article>
          )}

          {error && (
            <article className="competitor-message error">
              <p>{getReadableErrorMessage(error)}</p>
            </article>
          )}

          <div ref={bottomRef} />
        </section>

        <footer className="competitor-actions">
          <button
            disabled={!latestAnalysis || isLoading}
            onClick={copyAnalysis}
            type="button"
          >
            {copied ? "Skopiowano" : "📋 Kopiuj analizę"}
          </button>
          <button
            disabled={isLoading || renderedMessages.length === 0}
            onClick={clearAnalysis}
            type="button"
          >
            Nowa analiza
          </button>
        </footer>
      </section>
    </main>
  );
}
