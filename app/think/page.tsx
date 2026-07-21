"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ModelSelector } from "../components/ModelSelector";
import { TopNavigation } from "../components/TopNavigation";
import { getReadableErrorMessage } from "../lib/errors";
import { getAiModelDetails, type AiModel } from "../lib/models";

const thinkTransport = new DefaultChatTransport({
  api: "/api/think",
});

const sampleThinkQuestions = [
  "Firma ma 120 pracowników. 40% to kobiety, 25% kobiet i 15% mężczyzn pracuje zdalnie. Ile osób pracuje zdalnie?",
  "Mam ofertę: 12 000 zł brutto na UoP vs 15 000 zł netto na B2B. Co bardziej się opłaca?",
  "Jak podejść krok po kroku do analizy kosztów kredytu?",
] as const;

function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function ThinkPage() {
  const [input, setInput] = useState("");
  const [aiModel, setAiModel] = useState<AiModel>("flash");
  const [assistantModels, setAssistantModels] = useState<Record<string, AiModel>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const submittedModelRef = useRef<AiModel>("flash");
  const { clearError, messages, sendMessage, setMessages, status, error } =
    useChat({ transport: thinkTransport });

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

  function handleSampleQuestion(question: string) {
    clearError();
    setInput(question);
  }

  return (
    <main className="chat-shell think-shell">
      <TopNavigation className="think-nav" />

      <section className="chat-panel think-panel" aria-label="Tryb głębokiego myślenia">
        <header className="chat-header">
          <div className="agent-lockup">
            <div className="brand-mark" aria-hidden="true">
              M
            </div>
            <div>
              <p className="eyebrow">Analiza krok po kroku</p>
              <h1>🧠 Tryb głębokiego myślenia</h1>
              <p className="agent-description">
                Agent pokazuje tok rozumowania krok po kroku
              </p>
              <div className="sample-questions" aria-label="Przykładowe pytania">
                {sampleThinkQuestions.map((question) => (
                  <button
                    disabled={isLoading}
                    key={question}
                    onClick={() => handleSampleQuestion(question)}
                    type="button"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Gotowa
          </div>
        </header>

        <section className="memory-panel" aria-label="Akcje rozmowy">
          <div className="memory-content compact">
            <p className="memory-stat">Wiadomości: {renderedMessages.length}</p>
            <div className="memory-actions">
              <button
                disabled={isLoading || renderedMessages.length === 0}
                onClick={handleNewConversation}
                type="button"
              >
                🗑 Nowa analiza
              </button>
            </div>
          </div>
        </section>

        <div className="messages" aria-live="polite">
          {renderedMessages.length === 0 ? (
            <div className="empty-state">
              <p>Zadaj trudniejsze pytanie, a agent rozpisze analizę na kroki.</p>
            </div>
          ) : (
            renderedMessages.map((message) => (
              <article
                className={`message ${message.role === "user" ? "user" : "assistant"}`}
                key={message.id}
              >
                {message.role === "assistant" && (
                  <div className="message-badges">
                    <span className="mode-badge think">🧠 analiza</span>
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
                <span className="mode-badge think">🧠 analiza</span>
                <span className={`model-badge ${aiModel}`}>
                  {getAiModelDetails(aiModel).badge}
                </span>
              </div>
              <p>Analizuję krok po kroku...</p>
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
              aria-label="Wiadomość"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Zadaj trudne pytanie..."
              value={input}
            />
            <button disabled={!canSend} type="submit">
              Wyślij
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}


