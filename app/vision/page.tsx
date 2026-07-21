"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import {
  ImageAttachmentPreview,
  ImageDropOverlay,
  useImageAttachment,
} from "../components/ImageAttachment";
import { ModelSelector } from "../components/ModelSelector";
import { TopNavigation } from "../components/TopNavigation";
import { getAiModelDetails, type AiModel } from "../lib/models";

const visionQuestions = [
  "Co widzisz na tym obrazie?",
  "Wyciągnij cały tekst z tego screena",
  "Opisz to w 3 zdaniach",
  "Jakie kolory dominują? Podaj kody HEX",
  "Wygeneruj podobny obraz w innym stylu",
] as const;

type VisionMessage = {
  id: string;
  model?: AiModel;
  role: "assistant" | "user";
  text: string;
};

type GenerateImageResponse = {
  error?: string;
  image?: string;
  text?: string;
};

function getId() {
  return globalThis.crypto?.randomUUID?.() ?? String(Date.now());
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

async function readChatStream(response: Response, onDelta: (delta: string) => void) {
  if (!response.body) {
    throw new Error("Brak odpowiedzi strumieniowej.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const line = chunk
        .split("\n")
        .find((entry) => entry.startsWith("data: "));
      const payload = line?.replace("data: ", "").trim();

      if (!payload || payload === "[DONE]") {
        continue;
      }

      const event = JSON.parse(payload) as { delta?: string; type?: string };

      if (event.type === "text-delta" && event.delta) {
        fullText += event.delta;
        onDelta(event.delta);
      }
    }
  }

  return fullText;
}

export default function VisionPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<VisionMessage[]>([]);
  const [aiModel, setAiModel] = useState<AiModel>("flash");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingVariant, setIsGeneratingVariant] = useState(false);
  const [generatedImage, setGeneratedImage] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const isBusy = isAnalyzing || isGeneratingVariant;
  const canAsk = attachedImage != null && !isBusy;
  const contextStats = useMemo(() => {
    const characters = messages.reduce((sum, message) => sum + message.text.length, 0);

    return {
      messages: messages.length,
      tokens: Math.ceil(characters / 4),
    };
  }, [messages]);

  async function generateVariant(analysis: string) {
    if (!attachedImage) {
      return;
    }

    setIsGeneratingVariant(true);
    setGeneratedImage("");
    setGeneratedText("");

    try {
      const response = await fetch("/api/generate-image", {
        body: JSON.stringify({
          model: aiModel,
          prompt: `Wygeneruj podobny obraz w innym stylu. Zachowaj główny temat i kompozycję, ale nadaj nową stylistykę. Opis oryginału: ${analysis}`,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json()) as GenerateImageResponse;

      if (!response.ok || !data.image) {
        throw new Error(data.error ?? "Nie udało się wygenerować wariantu.");
      }

      setGeneratedImage(data.image);
      setGeneratedText(data.text ?? "");
    } catch (variantError) {
      setError(
        variantError instanceof Error
          ? variantError.message
          : "Nie udało się wygenerować wariantu.",
      );
    } finally {
      setIsGeneratingVariant(false);
    }
  }

  async function askVision(question: string) {
    const text = question.trim() || "Co widzisz na tym obrazie?";

    if (!attachedImage || isBusy) {
      setInput(text);
      return;
    }

    setError("");
    setInput("");
    setIsAnalyzing(true);
    setGeneratedImage("");
    setGeneratedText("");

    const userMessage: VisionMessage = {
      id: getId(),
      role: "user",
      text,
    };
    const assistantId = getId();
    const selectedModel = aiModel;

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      { id: assistantId, model: selectedModel, role: "assistant", text: "" },
    ]);

    try {
      const response = await fetch("/api/chat", {
        body: JSON.stringify({
          image: attachedImage.dataUrl,
          messages: [
            {
              id: userMessage.id,
              parts: [{ type: "text", text }],
              role: "user",
            },
          ],
          mode: "vision",
          model: selectedModel,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Nie udało się przeanalizować obrazu.");
      }

      const assistantText = await readChatStream(response, (delta) => {
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantId
              ? { ...message, text: `${message.text}${delta}` }
              : message,
          ),
        );
      });

      if (text.toLowerCase().includes("wygeneruj podobny")) {
        await generateVariant(assistantText);
      }
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "Nie udało się przeanalizować obrazu.",
      );
      setMessages((currentMessages) =>
        currentMessages.filter((message) => message.id !== assistantId),
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askVision(input);
  }

  function handleNewConversation() {
    setMessages([]);
    setGeneratedImage("");
    setGeneratedText("");
    setError("");
    setCopyStatus("");
  }

  function handleClearImage() {
    clearAttachedImage();
    setGeneratedImage("");
    setGeneratedText("");
    setMessages([]);
    setError("");
  }

  async function handleExportConversation() {
    const transcript =
      messages
        .map((message) => `${message.role === "user" ? "User" : "Vision"}: ${message.text}`)
        .join("\n") || "Brak wiadomości.";

    try {
      await copyTextToClipboard(transcript);
      setCopyStatus("Skopiowano");
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch {
      setCopyStatus("Nie udało się skopiować");
    }
  }

  return (
    <main
      className="chat-shell think-shell vision-shell"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TopNavigation className="think-nav" />

      <section
        className={`chat-panel think-panel vision-panel image-drop-target ${
          isDraggingImage ? "dragging" : ""
        }`}
        aria-label="Agent Vision"
      >
        <ImageDropOverlay isVisible={isDraggingImage} />

        <header className="chat-header">
          <div className="agent-lockup">
            <div className="brand-mark vision" aria-hidden="true">
              👁️
            </div>
            <div>
              <p className="eyebrow">Agent Vision</p>
              <h1>👁️ Agent Vision</h1>
              <p className="agent-description">
                Wklej screenshot, wrzuć plik lub przeciągnij obraz.
              </p>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Gotowy
          </div>
        </header>

        <div className="sample-questions vision-prompts" aria-label="Pytania o obraz">
          {visionQuestions.map((question) => (
            <button
              disabled={isBusy}
              key={question}
              onClick={() => void askVision(question)}
              type="button"
            >
              {question}
            </button>
          ))}
        </div>

        <section className="memory-panel" aria-label="Kontekst rozmowy">
          <button className="memory-toggle" type="button">
            <span>Kontekst rozmowy</span>
            <span aria-hidden="true">▲</span>
          </button>
          <div className="memory-content">
            <p className="memory-stat">
              Wiadomości: {contextStats.messages} | ~Tokeny: {contextStats.tokens}
            </p>
            <div className="memory-actions">
              <button
                disabled={isBusy || messages.length === 0}
                onClick={handleNewConversation}
                type="button"
              >
                🗑 Nowa rozmowa
              </button>
              <button
                disabled={messages.length === 0}
                onClick={handleExportConversation}
                type="button"
              >
                📋 Eksportuj
              </button>
            </div>
          </div>
          {copyStatus && <p className="copy-status">{copyStatus}</p>}
        </section>

        <section className="memory-panel" aria-label="Model AI">
          <div className="memory-content compact">
            <ModelSelector disabled={isBusy} onChange={setAiModel} value={aiModel} />
          </div>
        </section>

        <section className="vision-workspace" aria-live="polite">
          <input
            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
            className="file-input"
            onChange={handleFileInputChange}
            ref={fileInputRef}
            type="file"
          />

          {!attachedImage ? (
            <button
              className="vision-drop-zone"
              onClick={() => fileInputRef.current?.click()}
              onPaste={handlePaste}
              type="button"
            >
              <span>📷 Ctrl+V - wklej screenshot</span>
              <span>📁 Kliknij - wybierz plik</span>
              <span>🖱️ Przeciągnij - upuść obraz</span>
            </button>
          ) : (
            <div className="vision-grid">
              <aside className="vision-image-card">
                <ImageAttachmentPreview
                  attachedImage={attachedImage}
                  onRemove={handleClearImage}
                />
                <img alt={attachedImage.name} src={attachedImage.dataUrl} />
              </aside>

              <div className="vision-chat">
                <div className="messages vision-messages">
                  {messages.length === 0 ? (
                    <div className="empty-state">
                      <p>Zadaj pytanie o obraz albo wybierz prompt.</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <article
                        className={`message ${
                          message.role === "user" ? "user" : "assistant"
                        }`}
                        key={message.id}
                      >
                        {message.role === "assistant" && (
                          <div className="message-badges">
                            <span className="mode-badge vision">👁️ vision</span>
                            <span className={`model-badge ${message.model ?? "flash"}`}>
                              {getAiModelDetails(message.model ?? "flash").badge}
                            </span>
                          </div>
                        )}
                        <p>{message.text || "Analizuję obraz..."}</p>
                      </article>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {attachmentError && <p className="attachment-error">{attachmentError}</p>}
          {error && (
            <article className="message error vision-error">
              <p>{error}</p>
            </article>
          )}

          {(isGeneratingVariant || generatedImage) && (
            <section className="vision-variant" aria-label="Wariant obrazu">
              <div>
                <h2>Oryginał</h2>
                {attachedImage && <img alt="Oryginalny obraz" src={attachedImage.dataUrl} />}
              </div>
              <div>
                <h2>Nowa wersja</h2>
                {isGeneratingVariant ? (
                  <div className="image-loading">
                    <span>Generuję... (5-15 sekund)</span>
                  </div>
                ) : (
                  generatedImage && (
                    <>
                      <img alt="Wygenerowany wariant obrazu" src={generatedImage} />
                      {generatedText && <p>{generatedText}</p>}
                    </>
                  )
                )}
              </div>
            </section>
          )}
        </section>

        <form className="composer" onSubmit={handleSubmit}>
          <div className="composer-row">
            <input
              aria-label="Pytanie o obraz"
              disabled={isBusy}
              onChange={(event) => setInput(event.target.value)}
              onPaste={handlePaste}
              placeholder="Zadaj pytanie o obraz..."
              value={input}
            />
            <button
              aria-label="Wgraj obraz"
              className="attach-button"
              onClick={() => fileInputRef.current?.click()}
              title="Wgraj obraz"
              type="button"
            >
              📎
            </button>
            <button disabled={!canAsk} type="submit">
              Wyślij
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
