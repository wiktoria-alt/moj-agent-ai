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

const extractTransport = new DefaultChatTransport({
  api: "/api/chat",
});

const analyzerPrompts = [
  "Zacznij analizę SKD i powiedz, jakie dane mam podać.",
  "Mam umowę kredytu gotówkowego. Jak sprawdzić, czy dokumenty są kompletne do SKD?",
  "Sprawdź, czy przy wcześniejszej spłacie muszę mieć informację o zwrocie prowizji.",
  "Mam harmonogram i historię spłaty. Co powinno być widoczne w tych dokumentach?",
  "Wklejam screenshot umowy. Odczytaj widoczny tekst i wskaż możliwe ryzyka SKD.",
] as const;

function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export default function ExtractPage() {
  const [input, setInput] = useState("");
  const [aiModel, setAiModel] = useState<AiModel>("flash");
  const [assistantModels, setAssistantModels] = useState<Record<string, AiModel>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const submittedModelRef = useRef<AiModel>("flash");
  const { clearError, error, messages, sendMessage, setMessages, status } =
    useChat({ transport: extractTransport });
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

  const contextStats = useMemo(() => {
    const characters = renderedMessages.reduce(
      (sum, message) => sum + message.text.length,
      0,
    );

    return {
      messages: renderedMessages.length,
      tokens: Math.ceil(characters / 4),
    };
  }, [renderedMessages]);

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

    const text = rawText || "Odczytaj dokument i wskaż możliwe ryzyka SKD.";
    const selectedModel = aiModel;
    submittedModelRef.current = selectedModel;
    setInput("");

    try {
      await sendMessage(
        { text },
        {
          body: {
            image: attachedImage?.dataUrl,
            mode: "analyzer",
            model: selectedModel,
          },
        },
      );
      clearAttachedImage();
    } catch {
      clearError();
    }
  }

  function handleNewAnalysis() {
    clearError();
    setMessages([]);
    setAssistantModels({});
    clearAttachedImage();
  }

  function handleAnalyzerPrompt(prompt: string) {
    clearError();
    setInput(prompt);
  }

  return (
    <main
      className="chat-shell think-shell extract-shell"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TopNavigation className="think-nav" />

      <section
        className={`chat-panel think-panel extract-panel image-drop-target ${
          isDraggingImage ? "dragging" : ""
        }`}
        aria-label="Analizator SKD"
      >
        <ImageDropOverlay isVisible={isDraggingImage} />

        <header className="chat-header">
          <div className="agent-lockup">
            <div className="brand-mark extract" aria-hidden="true">
              📊
            </div>
            <div>
              <p className="eyebrow">Analiza dokumentów SKD</p>
              <h1>📊 Analizator</h1>
              <p className="agent-description">
                Wklej screenshot, opisz dane z umowy albo sprawdź komplet dokumentów.
              </p>
              <div className="sample-questions" aria-label="Prompty analizatora">
                {analyzerPrompts.map((prompt) => (
                  <button
                    disabled={isLoading}
                    key={prompt}
                    onClick={() => handleAnalyzerPrompt(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Gotowy
          </div>
        </header>

        <section className="memory-panel" aria-label="Kontekst analizy">
          <div className="memory-content compact">
            <p className="memory-stat">
              Wiadomości: {contextStats.messages} | ~Tokeny: {contextStats.tokens}
            </p>
            <div className="memory-actions">
              <button
                disabled={isLoading || renderedMessages.length === 0}
                onClick={handleNewAnalysis}
                type="button"
              >
                🗑 Nowa analiza
              </button>
            </div>
          </div>
        </section>

        <div className="messages extract-content" aria-live="polite">
          {renderedMessages.length === 0 ? (
            <div className="empty-state">
              <p>Wybierz prompt, wpisz dane z umowy albo wgraj obraz dokumentu.</p>
            </div>
          ) : (
            renderedMessages.map((message) => (
              <article
                className={`message ${
                  message.role === "user" ? "user" : "assistant markdown-message"
                }`}
                key={message.id}
              >
                {message.role === "assistant" && (
                  <div className="message-badges">
                    <span className="mode-badge agent">📊 analizator</span>
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
                <span className="mode-badge agent">📊 analizator</span>
                <span className={`model-badge ${aiModel}`}>
                  {getAiModelDetails(aiModel).badge}
                </span>
              </div>
              <p>Analizuję dokumenty i ryzyka...</p>
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
              aria-label="Opis dokumentu"
              onChange={(event) => setInput(event.target.value)}
              onPaste={handlePaste}
              placeholder="Opisz dokument albo wklej screenshot..."
              value={input}
            />

            <input
              accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
              className="file-input"
              id="image-upload-extract"
              onChange={handleFileInputChange}
              type="file"
            />
            <label
              aria-label="Wgraj obraz"
              className="attach-button"
              htmlFor="image-upload-extract"
              title="Wgraj obraz"
            >
              📎
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
