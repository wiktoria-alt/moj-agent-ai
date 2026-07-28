"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TopNavigation } from "../components/TopNavigation";

const sampleEmails = `Mail 1 - PILNY:
Od: jan.kowalski@firma.pl
Temat: PILNE - Problem z fakturą
Treść: Dzień dobry, mam problem z fakturą FV/2026/001. Kwota jest nieprawidłowa - powinno być 5000 zł a jest 3000 zł. Proszę o PILNĄ korektę. Termin płatności mija jutro.

Mail 2 - SPAM:
Od: winner@lucky-prize.com
Temat: Congratulations! You won $1,000,000
Treść: Click here to claim your prize! Limited time offer. Act now!

Mail 3 - OFERTA:
Od: anna.nowak@partner.pl
Temat: Propozycja współpracy
Treść: Dzień dobry, reprezentuję firmę ABC Solutions. Chcielibyśmy omówić możliwość współpracy w zakresie dostarczania usług IT. Czy możemy umówić się na spotkanie w przyszłym tygodniu?

Mail 4 - REKLAMACJA:
Od: klient123@gmail.com
Temat: Nie działa usługa od 3 dni
Treść: Witam, od poniedziałku nie mogę się zalogować do panelu klienta. Próbowałem resetować hasło ale nie dostaję maila. To już trzeci dzień! Jeśli nie rozwiążecie tego dziś, zrezygnuję z usługi.

Mail 5 - INFO:
Od: newsletter@branżowy-portal.pl
Temat: Nowe trendy AI w biznesie - raport 2026
Treść: Zapraszamy do lektury naszego najnowszego raportu o zastosowaniach AI w polskich firmach. Pobierz za darmo na naszej stronie.`;

type ParsedMail = {
  category: string;
  draft: string;
  index: number;
  priority: "high" | "medium" | "low" | "spam";
  reason: string;
  raw: string;
  title: string;
};

const priorityConfig = {
  high: { className: "high", label: "🔴 Wysoki" },
  medium: { className: "medium", label: "🟡 Średni" },
  low: { className: "low", label: "🟢 Niski" },
  spam: { className: "spam", label: "🗑️ Spam" },
} as const;

function splitEmails(value: string) {
  return value
    .split(/\n\s*\n/g)
    .map((email) => email.trim())
    .filter(Boolean);
}

function cleanMarkdownCell(value: string) {
  return value
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .replace(/\*\*/g, "")
    .trim();
}

function getTableValue(section: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = section.match(new RegExp(`\\|\\s*${escapedLabel}\\s*\\|([^\\n]+)`, "i"));
  return match ? cleanMarkdownCell(match[1]) : "";
}

function detectPriority(section: string): ParsedMail["priority"] {
  const normalized = section.toLowerCase();

  if (normalized.includes("spam") || normalized.includes("🗑")) {
    return "spam";
  }

  if (normalized.includes("wysoki") || normalized.includes("pilny") || section.includes("🔴")) {
    return "high";
  }

  if (normalized.includes("średni") || normalized.includes("sredni") || section.includes("🟡")) {
    return "medium";
  }

  return "low";
}

function parseDraft(section: string) {
  const draftMatch = section.match(
    /\*\*Proponowana odpowied(?:ź|z):\*\*([\s\S]*?)(?:\n---|\n###|\nPODSUMOWANIE|$)/i,
  );
  const draft = draftMatch?.[1] ?? "";

  return draft
    .split("\n")
    .map((line) => line.replace(/^>\s?/, "").trimEnd())
    .join("\n")
    .trim();
}

function parseMailCards(markdown: string): ParsedMail[] {
  return markdown
    .split(/(?=^###\s*Mail\s+\d+)/gm)
    .filter((section) => /^###\s*Mail\s+\d+/m.test(section))
    .map((section, fallbackIndex) => {
      const titleMatch = section.match(/^###\s*Mail\s+(\d+):?\s*(.*)$/m);
      const category = getTableValue(section, "Kategoria");
      const reason = getTableValue(section, "Uzasadnienie");
      const priority = detectPriority(section);

      return {
        category: category || "W trakcie analizy",
        draft: parseDraft(section),
        index: Number(titleMatch?.[1] ?? fallbackIndex + 1),
        priority,
        reason: reason || "Agent jeszcze dopisuje uzasadnienie.",
        raw: section.trim(),
        title: titleMatch?.[2]?.trim() || "Analizowany mail",
      };
    });
}

function getSummaryFromCards(cards: ParsedMail[]) {
  return cards.reduce(
    (summary, card) => {
      summary[card.priority] += 1;
      return summary;
    },
    { high: 0, low: 0, medium: 0, spam: 0 },
  );
}

export default function EmailTriagePage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const emailCount = useMemo(() => splitEmails(input).length, [input]);
  const cards = useMemo(() => parseMailCards(result), [result]);
  const summary = useMemo(() => getSummaryFromCards(cards), [cards]);
  const hasCards = cards.length > 0;
  const finalSummary = result.includes("PODSUMOWANIE")
    ? result.slice(result.indexOf("PODSUMOWANIE"))
    : "";

  async function analyzeEmails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const emails = splitEmails(input);
    if (emails.length === 0 || isLoading) {
      return;
    }

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setCopiedIndex(null);
    setError("");
    setResult("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/email-triage", {
        body: JSON.stringify({ emails }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: abortController.signal,
      });

      if (!response.ok || response.body == null) {
        throw new Error("Nie udało się uruchomić analizy maili.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        setResult((current) => current + decoder.decode(value, { stream: true }));
      }

      setResult((current) => current + decoder.decode());
    } catch (caughtError) {
      if ((caughtError as Error).name !== "AbortError") {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Nieznany błąd podczas analizy.",
        );
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }

  function pasteExample() {
    setInput(sampleEmails);
    setError("");
  }

  function clearAll() {
    abortRef.current?.abort();
    setInput("");
    setResult("");
    setError("");
    setCopiedIndex(null);
    setIsLoading(false);
  }

  async function copyDraft(index: number, draft: string) {
    await navigator.clipboard.writeText(draft);
    setCopiedIndex(index);
    window.setTimeout(() => setCopiedIndex(null), 1800);
  }

  return (
    <main className="chat-shell email-triage-shell">
      <TopNavigation className="think-nav" />

      <section className="email-triage-panel" aria-label="E-mail Triage">
        <header className="email-triage-header">
          <div>
            <p className="eyebrow">Agent zadaniowy</p>
            <h1>📧 E-mail Triage</h1>
            <p className="agent-description">
              Wklej maile - agent posortuje i napisze odpowiedzi.
            </p>
          </div>
          <div className="email-triage-status">
            <span>{emailCount}</span>
            maili do analizy
          </div>
        </header>

        <section className="email-triage-grid">
          <form className="email-triage-form" onSubmit={analyzeEmails}>
            <label htmlFor="emails">Maile</label>
            <textarea
              id="emails"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Wklej maile tutaj - oddziel je pustą linią..."
              value={input}
            />

            <div className="email-triage-actions">
              <button disabled={emailCount === 0 || isLoading} type="submit">
                📧 Analizuj maile
              </button>
              <button disabled={isLoading} onClick={pasteExample} type="button">
                📋 Wklej przykład
              </button>
              <button disabled={isLoading && !result} onClick={clearAll} type="button">
                Wyczyść
              </button>
            </div>

            {error && <p className="email-triage-error">{error}</p>}
          </form>

          <section className="email-triage-results" aria-live="polite">
            {hasCards && (
              <div className="email-summary-card">
                <strong>
                  {summary.high} pilne, {summary.medium} średnie, {summary.low} niskie,{" "}
                  {summary.spam} spam
                </strong>
                <span>
                  {isLoading ? "Agent jeszcze dopisuje analizę..." : "Analiza gotowa"}
                </span>
              </div>
            )}

            {!result && !isLoading && (
              <div className="email-empty-state">
                <p>Wynik pojawi się tutaj jako karty z priorytetami i draftami odpowiedzi.</p>
              </div>
            )}

            {isLoading && !result && (
              <div className="email-empty-state loading">
                <p>Analizuję maile...</p>
              </div>
            )}

            {hasCards ? (
              <div className="email-card-list">
                {cards.map((card) => {
                  const priority = priorityConfig[card.priority];

                  return (
                    <article
                      className={`email-result-card ${priority.className}`}
                      key={`${card.index}-${card.title}`}
                    >
                      <header>
                        <div>
                          <span className="email-priority">{priority.label}</span>
                          <h2>
                            Mail {card.index}: {card.title}
                          </h2>
                        </div>
                        <span className="email-category">{card.category}</span>
                      </header>

                      <p className="email-reason">{card.reason}</p>

                      {card.draft ? (
                        <div className="email-draft">
                          <div>
                            <strong>Proponowana odpowiedź</strong>
                            <button
                              onClick={() => void copyDraft(card.index, card.draft)}
                              type="button"
                            >
                              {copiedIndex === card.index ? "Skopiowano" : "Kopiuj draft"}
                            </button>
                          </div>
                          <blockquote>{card.draft}</blockquote>
                        </div>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.raw}</ReactMarkdown>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              result && (
                <article className="email-result-card markdown-message">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
                </article>
              )
            )}

            {finalSummary && (
              <article className="email-final-summary markdown-message">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalSummary}</ReactMarkdown>
              </article>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}
