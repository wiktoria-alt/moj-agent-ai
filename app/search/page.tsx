"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ImageAttachmentPreview,
  ImageDropOverlay,
  useImageAttachment,
} from "../components/ImageAttachment";
import { ModelSelector } from "../components/ModelSelector";
import { TopNavigation } from "../components/TopNavigation";
import { getReadableErrorMessage } from "../lib/errors";
import { getAiModelDetails, type AiModel } from "../lib/models";

const searchTransport = new DefaultChatTransport({
  api: "/api/chat",
});

const sampleSearchQuestions = [
  "Jakie są najnowsze wiadomości o sztucznej inteligencji?",
  "Ile kosztuje iPhone 16 Pro w Polsce?",
  "Kto wygrał ostatni mecz reprezentacji Polski?",
  "Jakie filmy są teraz w kinach?",
] as const;

function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function SearchPage() {
  const [input, setInput] = useState("");
  const [aiModel, setAiModel] = useState<AiModel>("flash");
  const [assistantModels, setAssistantModels] = useState<Record<string, AiModel>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const submittedModelRef = useRef<AiModel>("flash");
  const { clearError, messages, sendMessage, setMessages, status, error } =
    useChat({ transport: searchTransport });
  const {
    attachedImage,
    attachmentError,
    clearAttachedImage,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
    handlePaste,
    isDraggingImage,
  } = useImageAttachment();

  const isLoading = status === "submitted" || status === "streaming";
  const canSend = (input.trim().length > 0 || attachedImage != null) && !isLoading;

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

    const rawText = input.trim();
    if ((!rawText && !attachedImage) || isLoading) {
      return;
    }

    const text = rawText || "Co widzisz na tym obrazie?";
    const selectedModel = aiModel;
    submittedModelRef.current = selectedModel;
    setInput("");
    try {
      await sendMessage(
        { text },
        {
          body: {
            image: attachedImage?.dataUrl,
            mode: "search",
            model: selectedModel,
          },
        },
      );
      clearAttachedImage();
    } catch {
      clearError();
    }
  }

  function handleNewConversation() {
    clearError();
    setMessages([]);
    setAssistantModels({});
    clearAttachedImage();
  }

  function handleSampleQuestion(question: string) {
    clearError();
    setInput(question);
  }

  return (
    <main className="chat-shell think-shell search-shell">
      <TopNavigation className="think-nav" />

      <section
        className={`chat-panel think-panel search-panel image-drop-target ${
          isDraggingImage ? "dragging" : ""
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        aria-label="Agent z wyszukiwarką"
      >
        <ImageDropOverlay isVisible={isDraggingImage} />
        <header className="chat-header">
          <div className="agent-lockup">
            <div className="brand-mark search" aria-hidden="true">
              🌐
            </div>
            <div>
              <p className="eyebrow">Google Search grounding</p>
              <h1>🌐 Agent z wyszukiwarką</h1>
              <p className="agent-description">
                Przeszukuję prawdziwy internet i czytam strony
              </p>
              <div className="sample-questions" aria-label="Przykładowe pytania">
                {sampleSearchQuestions.map((question) => (
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
            Online
          </div>
        </header>

        <section className="memory-panel" aria-label="Akcje wyszukiwarki">
          <div className="memory-content compact">
            <p className="memory-stat">Wiadomości: {renderedMessages.length}</p>
            <div className="memory-actions">
              <button
                disabled={isLoading || renderedMessages.length === 0}
                onClick={handleNewConversation}
                type="button"
              >
                🗑 Nowe wyszukiwanie
              </button>
            </div>
          </div>
        </section>

        <div className="messages" aria-live="polite">
          {renderedMessages.length === 0 ? (
            <div className="empty-state">
              <p>Zapytaj o cokolwiek aktualnego albo wklej adres strony do przeczytania.</p>
            </div>
          ) : (
            renderedMessages.map((message) => (
              <article
                className={`message ${message.role === "user" ? "user" : "assistant markdown-message"}`}
                key={message.id}
              >
                {message.role === "assistant" && (
                  <div className="message-badges">
                    <span className="mode-badge search">🌐 szukaj</span>
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
                <span className="mode-badge search">🌐 szukaj</span>
                <span className={`model-badge ${aiModel}`}>
                  {getAiModelDetails(aiModel).badge}
                </span>
              </div>
              <p>Szukam i sprawdzam źródła...</p>
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
          <ImageAttachmentPreview
            attachedImage={attachedImage}
            onRemove={clearAttachedImage}
          />
          {attachmentError && <p className="attachment-error">{attachmentError}</p>}

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
              onPaste={handlePaste}
              placeholder="Zapytaj o cokolwiek aktualnego..."
              value={input}
            />

            <input
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              className="file-input"
              id="image-upload-search"
              onChange={handleFileInputChange}
              type="file"
            />
            <label
              aria-label="Wgraj obraz"
              className="attach-button"
              htmlFor="image-upload-search"
              title="Wgraj obraz"
            >
              <svg
                aria-hidden="true"
                fill="none"
                height="20"
                viewBox="0 0 24 24"
                width="20"
              >
                <path
                  d="M21.4 11.6l-8.8 8.8a6 6 0 0 1-8.5-8.5l9.4-9.4a4.1 4.1 0 1 1 5.8 5.8l-9.5 9.5a2.3 2.3 0 0 1-3.3-3.3l8.8-8.8"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </label>

            <button disabled={!canSend} type="submit">
              Wyślij
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}


