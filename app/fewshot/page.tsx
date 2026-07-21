"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ModelSelector } from "../components/ModelSelector";
import { TopNavigation } from "../components/TopNavigation";
import { getReadableErrorMessage } from "../lib/errors";
import { getAiModelDetails, type AiModel } from "../lib/models";

const fewShotTransport = new DefaultChatTransport({
  api: "/api/fewshot",
});

const sampleTerms = [
  "Sztuczna inteligencja",
  "Agent AI",
  "Prompt",
  "Halucynacja AI",
  "RAG",
  "API",
] as const;

function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function FewShotPage() {
  const [input, setInput] = useState("");
  const [aiModel, setAiModel] = useState<AiModel>("flash");
  const [assistantModels, setAssistantModels] = useState<Record<string, AiModel>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const submittedModelRef = useRef<AiModel>("flash");
  const { clearError, messages, sendMessage, setMessages, status, error } =
    useChat({ transport: fewShotTransport });

  const isLoading = status === "submitted" || status === "streaming";
  const canSend = input.trim().length > 0 && !isLoading;

  const renderedMessages = useMemo(
    () =>
      messages.map((message) => ({
        id: message.id,
        model:
          message.role === "assistant" ? assistantModels[message.id] : undefined,
        role: message.role,
        text: getMessageText(message),
      })),
    [assistantModels, messages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    setAssistantModels((currentModels) => {
      let hasChanges = false;
      const nextModels = { ...currentModels };

      for (const message of messages) {
        if (message.role === "assistant" && nextModels[message.id] == null) {
          nextModels[message.id] = submittedModelRef.current;
          hasChanges = true;
        }
      }

      return hasChanges ? nextModels : currentModels;
    });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text || isLoading) {
      return;
    }

    setInput("");
    submittedModelRef.current = aiModel;
    try {
      await sendMessage({ text }, { body: { model: aiModel } });
    } catch {
      clearError();
    }
  }

  function handleNewConversation() {
    clearError();
    setMessages([]);
    setAssistantModels({});
  }

  function handleSampleTerm(term: string) {
    clearError();
    setInput(term);
  }

  return (
    <main className="chat-shell think-shell">
      <TopNavigation className="think-nav" />

      <section className="chat-panel think-panel" aria-label="Słownik AI">
        <header className="chat-header">
          <div className="agent-lockup">
            <div className="brand-mark dictionary" aria-hidden="true">
              S
            </div>
            <div>
              <p className="eyebrow">Few-shot prompting</p>
              <h1>📚 Słownik AI</h1>
              <p className="agent-description">
                Wyjaśniam trudne pojęcia prostym językiem
              </p>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Gotowa
          </div>
        </header>

        <section className="memory-panel" aria-label="Akcje słownika">
          <div className="memory-content compact">
            <p className="memory-stat">Hasła w rozmowie: {renderedMessages.length}</p>
            <div className="memory-actions">
              <button
                disabled={isLoading || renderedMessages.length === 0}
                onClick={handleNewConversation}
                type="button"
              >
                🗑 Nowe hasło
              </button>
            </div>
          </div>
        </section>

        <div className="messages" aria-live="polite">
          {renderedMessages.length === 0 ? (
            <div className="empty-state">
              <p>Wpisz pojęcie, a słownik wyjaśni je prostym językiem i poda przykład.</p>
            </div>
          ) : (
            renderedMessages.map((message) => (
              <article
                className={`message ${message.role === "user" ? "user" : "assistant"}`}
                key={message.id}
              >
                {message.role === "assistant" && (
                  <div className="message-badges">
                    <span className="mode-badge dictionary">📚 słownik</span>
                    <span className={`model-badge ${message.model ?? "flash"}`}>
                      {getAiModelDetails(message.model ?? "flash").badge}
                    </span>
                  </div>
                )}
                <p>{message.text}</p>
              </article>
            ))
          )}

          {isLoading && (
            <article className="message assistant loading">
              <div className="message-badges">
                <span className="mode-badge dictionary">📚 słownik</span>
                <span className={`model-badge ${aiModel}`}>
                  {getAiModelDetails(aiModel).badge}
                </span>
              </div>
              <p>Układam prostą definicję...</p>
            </article>
          )}

          {error && (
            <article className="message error">
              <p>{getReadableErrorMessage(error)}</p>
            </article>
          )}

          <div ref={bottomRef} />
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <div className="control-strip" aria-label="Ustawienia odpowiedzi">
            <ModelSelector
              disabled={isLoading}
              onChange={setAiModel}
              value={aiModel}
            />
          </div>

          <div className="composer-row">
            <input
              aria-label="Pojęcie"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Wpisz pojęcie do wyjaśnienia..."
              value={input}
            />
            <button disabled={!canSend} type="submit">
              Wyślij
            </button>
          </div>
        </form>

        <div className="sample-questions dictionary-prompts" aria-label="Przykładowe pojęcia">
          {sampleTerms.map((term) => (
            <button
              disabled={isLoading}
              key={term}
              onClick={() => handleSampleTerm(term)}
              type="button"
            >
              {term}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}


