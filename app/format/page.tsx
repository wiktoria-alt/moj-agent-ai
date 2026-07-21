"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ModelSelector } from "../components/ModelSelector";
import { TopNavigation } from "../components/TopNavigation";
import { getReadableErrorMessage } from "../lib/errors";
import { getAiModelDetails, type AiModel } from "../lib/models";

const formatTransport = new DefaultChatTransport({
  api: "/api/format",
});

const sampleCommands = [
  "/tabela języki programowania 2026",
  "/porownanie ChatGPT vs Claude",
  "/lista 5 kroków do pierwszego agenta AI",
  "/faq sztuczna inteligencja dla początkujących",
  "/email podziękowanie za udaną rekrutację",
] as const;

function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function FormatPage() {
  const [input, setInput] = useState("");
  const [aiModel, setAiModel] = useState<AiModel>("flash");
  const [assistantModels, setAssistantModels] = useState<Record<string, AiModel>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const submittedModelRef = useRef<AiModel>("flash");
  const { clearError, messages, sendMessage, setMessages, status, error } =
    useChat({ transport: formatTransport });

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

  function handleSampleCommand(command: string) {
    clearError();
    setInput(command);
  }

  return (
    <main className="chat-shell think-shell">
      <TopNavigation className="think-nav" />

      <section className="chat-panel think-panel format-panel" aria-label="Formatowanie">
        <header className="chat-header">
          <div className="agent-lockup">
            <div className="brand-mark format" aria-hidden="true">
              F
            </div>
            <div>
              <p className="eyebrow">Markdown i struktura</p>
              <h1>📐 Formatowanie</h1>
              <p className="agent-description">
                Agent odpowiada w tabeli, liście, porównaniu - na żądanie
              </p>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Gotowa
          </div>
        </header>

        <section className="memory-panel" aria-label="Akcje formatera">
          <div className="memory-content compact">
            <p className="memory-stat">Wiadomości: {renderedMessages.length}</p>
            <div className="memory-actions">
              <button
                disabled={isLoading || renderedMessages.length === 0}
                onClick={handleNewConversation}
                type="button"
              >
                🗑 Nowy format
              </button>
            </div>
          </div>
        </section>

        <div className="messages" aria-live="polite">
          {renderedMessages.length === 0 ? (
            <div className="empty-state">
              <p>Wybierz komendę albo wpisz własną, a agent zwróci gotowy markdown.</p>
            </div>
          ) : (
            renderedMessages.map((message) => (
              <article
                className={`message ${message.role === "user" ? "user" : "assistant markdown-message"}`}
                key={message.id}
              >
                {message.role === "assistant" && (
                  <div className="message-badges">
                    <span className="mode-badge format">📐 formater</span>
                    <span className={`model-badge ${message.model ?? "flash"}`}>
                      {getAiModelDetails(message.model ?? "flash").badge}
                    </span>
                  </div>
                )}
                {message.role === "assistant" ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
                ) : (
                  <p>{message.text}</p>
                )}
              </article>
            ))
          )}

          {isLoading && (
            <article className="message assistant loading">
              <div className="message-badges">
                <span className="mode-badge format">📐 formater</span>
                <span className={`model-badge ${aiModel}`}>
                  {getAiModelDetails(aiModel).badge}
                </span>
              </div>
              <p>Formatuję odpowiedź...</p>
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
              aria-label="Komenda formatowania"
              onChange={(event) => setInput(event.target.value)}
              placeholder="Wpisz komendę, np. /tabela modele AI..."
              value={input}
            />
            <button disabled={!canSend} type="submit">
              Wyślij
            </button>
          </div>
        </form>

        <div className="sample-questions dictionary-prompts" aria-label="Przykładowe komendy">
          {sampleCommands.map((command) => (
            <button
              disabled={isLoading}
              key={command}
              onClick={() => handleSampleCommand(command)}
              type="button"
            >
              {command}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}


