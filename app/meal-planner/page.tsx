"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TopNavigation } from "../components/TopNavigation";
import { getReadableErrorMessage } from "../lib/errors";

const mealPlannerTransport = new DefaultChatTransport({
  api: "/api/meal-planner",
});

const examples = [
  {
    budget: "250 PLN",
    days: "5",
    people: "1",
    preferences: "Tanie, szybkie posiłki do pracy. Bez ryb. Lubię kurczaka, jajka, ryż i warzywa.",
  },
  {
    budget: "420 PLN",
    days: "7",
    people: "2",
    preferences: "Dieta wegetariańska, dużo białka, obiady do odgrzania, maksymalnie 30 minut gotowania.",
  },
  {
    budget: "300 PLN",
    days: "5",
    people: "1",
    preferences: "Plan redukcyjny, bez laktozy, proste śniadania, kolacje lekkie, zakupy w Lidlu/Biedronce.",
  },
] as const;

function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function buildPrompt({
  budget,
  days,
  people,
  preferences,
}: {
  budget: string;
  days: string;
  people: string;
  preferences: string;
}) {
  return `Ułóż plan posiłków.
Liczba dni: ${days}
Liczba osób: ${people}
Budżet: ${budget}
Preferencje i ograniczenia: ${preferences}`;
}

export default function MealPlannerPage() {
  const [preferences, setPreferences] = useState("");
  const [days, setDays] = useState("7");
  const [people, setPeople] = useState("1");
  const [budget, setBudget] = useState("");
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { clearError, error, messages, sendMessage, setMessages, status } =
    useChat({ transport: mealPlannerTransport });

  const isLoading = status === "submitted" || status === "streaming";
  const canSend = preferences.trim().length > 0 && days.trim() && people.trim() && !isLoading;

  const renderedMessages = useMemo(
    () =>
      messages.map((message) => ({
        id: message.id,
        role: message.role,
        text: getMessageText(message),
      })),
    [messages],
  );

  const latestPlan = useMemo(
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

  async function createPlan(nextValues?: {
    budget: string;
    days: string;
    people: string;
    preferences: string;
  }) {
    const values = nextValues ?? { budget, days, people, preferences };

    if (!values.preferences.trim() || isLoading) {
      return;
    }

    clearError();
    setCopied(false);

    try {
      await sendMessage({ text: buildPrompt(values) });
    } catch {
      clearError();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void createPlan();
  }

  function useExample(example: (typeof examples)[number]) {
    setBudget(example.budget);
    setDays(example.days);
    setPeople(example.people);
    setPreferences(example.preferences);
    void createPlan(example);
  }

  function clearPlan() {
    clearError();
    setMessages([]);
    setCopied(false);
  }

  async function copyPlan() {
    if (!latestPlan) {
      return;
    }

    await navigator.clipboard.writeText(latestPlan);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="chat-shell meal-shell">
      <TopNavigation className="think-nav" />

      <section className="meal-panel" aria-label="Planer posiłków">
        <header className="meal-header">
          <div>
            <p className="eyebrow">Twój scenariusz W4</p>
            <h1>🍽️ Planer posiłków</h1>
            <p className="agent-description">
              Podaj preferencje, budżet i liczbę dni - agent ułoży jadłospis, listę zakupów i koszty.
            </p>
          </div>
          <span className="meal-status">
            {isLoading ? "Układam jadłospis" : "Gotowy"}
          </span>
        </header>

        <form className="meal-form" onSubmit={handleSubmit}>
          <div className="meal-input-grid">
            <label>
              <span>Liczba dni</span>
              <input onChange={(event) => setDays(event.target.value)} value={days} />
            </label>
            <label>
              <span>Liczba osób</span>
              <input onChange={(event) => setPeople(event.target.value)} value={people} />
            </label>
            <label>
              <span>Budżet</span>
              <input
                onChange={(event) => setBudget(event.target.value)}
                placeholder="Np. 350 PLN"
                value={budget}
              />
            </label>
          </div>

          <label className="meal-preferences">
            <span>Preferencje i ograniczenia</span>
            <textarea
              onChange={(event) => setPreferences(event.target.value)}
              placeholder="Np. wegetariańskie, bez laktozy, obiady do pracy, mało gotowania, lubię makaron i warzywa..."
              value={preferences}
            />
          </label>

          <button className="meal-submit" disabled={!canSend} type="submit">
            🍽️ Zaplanuj posiłki
          </button>
        </form>

        <div className="meal-examples" aria-label="Przykładowe plany">
          {examples.map((example) => (
            <button
              disabled={isLoading}
              key={`${example.days}-${example.budget}-${example.preferences}`}
              onClick={() => useExample(example)}
              type="button"
            >
              {example.days} dni / {example.people} os. / {example.budget}
            </button>
          ))}
        </div>

        <section className="meal-result" aria-live="polite">
          {renderedMessages.length === 0 && !isLoading ? (
            <div className="meal-empty">
              <p>Wpisz swoje preferencje albo kliknij przykład. Plan pojawi się tutaj.</p>
            </div>
          ) : (
            renderedMessages.map((message) => (
              <article
                className={`meal-message ${
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
            <article className="meal-message assistant loading">
              <p>Liczy koszty, układam jadłospis i listę zakupów...</p>
            </article>
          )}

          {error && (
            <article className="meal-message error">
              <p>{getReadableErrorMessage(error)}</p>
            </article>
          )}

          <div ref={bottomRef} />
        </section>

        <footer className="meal-actions">
          <button disabled={!latestPlan || isLoading} onClick={copyPlan} type="button">
            {copied ? "Skopiowano" : "📋 Kopiuj plan"}
          </button>
          <button
            disabled={isLoading || renderedMessages.length === 0}
            onClick={clearPlan}
            type="button"
          >
            Nowy plan
          </button>
        </footer>
      </section>
    </main>
  );
}
