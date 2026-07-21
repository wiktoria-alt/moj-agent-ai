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

const agentTransport = new DefaultChatTransport({
  api: "/api/chat",
});

const USER_ID_STORAGE_KEY = "user_id";

function getOrCreateUserId() {
  const storedUserId = window.localStorage.getItem(USER_ID_STORAGE_KEY);

  if (storedUserId) {
    return storedUserId;
  }

  const userId = crypto.randomUUID();
  window.localStorage.setItem(USER_ID_STORAGE_KEY, userId);
  return userId;
}

const availableTools = [
  { emoji: "📚", name: "Baza wiedzy" },
  { emoji: "🌤️", name: "Pogoda" },
  { emoji: "🧮", name: "Kalkulator" },
  { emoji: "🕐", name: "Data i czas" },
  { emoji: "🌐", name: "Google Search" },
  { emoji: "📄", name: "Czytanie stron" },
  { emoji: "🎨", name: "Generowanie obrazów" },
  { emoji: "👁️", name: "Analiza obrazów" },
] as const;

const scenarios = [
  "Znajdź w Google co robi firma Syntelligence i wygeneruj dla nich logo",
  "Przeczytaj stronę apple.com i opisz ich aktualną ofertę iPhone",
  "Ile to 23% VAT z 8500 PLN? Podaj kwotę brutto i netto",
  "Jakie są najnowsze wiadomości o AI? Wygeneruj grafikę do posta o tym",
  "Wyszukaj w Google 'best coffee shops Kraków' i streszcz wyniki",
] as const;

const toolDetails: Record<string, { emoji: string; label: string }> = {
  searchKnowledge: { emoji: "📚", label: "Baza wiedzy" },
  getWeather: { emoji: "🌤️", label: "Pogoda" },
  calculator: { emoji: "🧮", label: "Kalkulator" },
  currentDateTime: { emoji: "🕐", label: "Data i czas" },
  generateImage: { emoji: "🎨", label: "Generowanie obrazu" },
  google_search: { emoji: "🌐", label: "Google Search" },
  readWebPage: { emoji: "📄", label: "Czytanie strony" },
};

type AgentPart = {
  errorText?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
  text?: string;
  title?: string;
  toolCallId?: string;
  toolName?: string;
  type: string;
  url?: string;
};

type RenderedMessage = {
  id: string;
  model?: AiModel;
  role: "assistant" | "system" | "user";
  knowledgeSource: string | null;
  sources: AgentPart[];
  text: string;
  toolParts: AgentPart[];
};

function isToolPart(part: AgentPart) {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function getToolName(part: AgentPart) {
  if (part.type === "dynamic-tool") {
    return part.toolName ?? "tool";
  }

  return part.type.replace(/^tool-/, "");
}

function getMessageText(parts: AgentPart[]) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

function splitKnowledgeSource(text: string) {
  const match = text.match(/\n*📎 Źródł(?:o|a):\s*(.+)\s*$/u);

  return match
    ? { knowledgeSource: match[0].trim(), text: text.slice(0, match.index).trim() }
    : { knowledgeSource: null, text };
}

function shorten(text: string, maxLength = 180) {
  const cleanText = text.replace(/\s+/g, " ").trim();

  if (cleanText.length <= maxLength) {
    return cleanText;
  }

  return `${cleanText.slice(0, maxLength - 1)}…`;
}

function valueToPreview(value: unknown, maxLength = 160): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value.startsWith("data:image/") ? "[obraz]" : shorten(value, maxLength);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return shorten(
      JSON.stringify(value, (_key, nextValue) =>
        typeof nextValue === "string" && nextValue.startsWith("data:image/")
          ? "[obraz]"
          : nextValue,
      ) ?? "",
      maxLength,
    );
  } catch {
    return "[wynik]";
  }
}

function formatArgs(input: unknown) {
  if (input == null) {
    return "";
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    return valueToPreview(input, 120);
  }

  return Object.entries(input)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${valueToPreview(value, 90)}`)
    .join(", ");
}

function getOutputObject(output: unknown) {
  return typeof output === "object" && output != null
    ? (output as Record<string, unknown>)
    : null;
}

function getGeneratedImage(output: unknown) {
  const outputObject = getOutputObject(output);
  const image = outputObject?.image;

  return typeof image === "string" ? image : "";
}

function getGeneratedPrompt(output: unknown) {
  const outputObject = getOutputObject(output);
  const prompt = outputObject?.prompt;

  return typeof prompt === "string" ? prompt : "ai-generated";
}

function getToolSummary(part: AgentPart) {
  const name = getToolName(part);
  const outputObject = getOutputObject(part.output);

  if (part.state === "output-error") {
    return part.errorText ?? "Narzędzie zwróciło błąd.";
  }

  if (part.state === "output-denied") {
    return "Wywołanie narzędzia zostało zatrzymane.";
  }

  if (part.state !== "output-available") {
    return "W trakcie wykonywania...";
  }

  if (name === "generateImage") {
    if (typeof outputObject?.error === "string") {
      return outputObject.error;
    }

    return "Obraz został wygenerowany.";
  }

  if (name === "calculator") {
    const expression = outputObject?.expression;
    const result = outputObject?.result;

    return `${valueToPreview(expression)} = ${valueToPreview(result)}`;
  }

  if (name === "currentDateTime") {
    return valueToPreview(outputObject?.formatted ?? part.output);
  }

  return valueToPreview(part.output);
}

function downloadImage(src: string, prompt: string) {
  const link = document.createElement("a");
  link.href = src;
  link.download = `${prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "ai-generated"}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function ToolTimeline({ toolParts }: { toolParts: AgentPart[] }) {
  if (toolParts.length === 0) {
    return null;
  }

  return (
    <section className="tool-timeline" aria-label="Timeline narzędzi">
      <div className="tool-timeline-header">
        <span>🤖 Agent wykonuje zadanie...</span>
      </div>

      {toolParts.map((part, index) => {
        const name = getToolName(part);
        const details = toolDetails[name] ?? { emoji: "🔧", label: name };
        const args = formatArgs(part.input);
        const image = getGeneratedImage(part.output);
        const prompt = getGeneratedPrompt(part.output);
        const isRunning =
          part.state !== "output-available" &&
          part.state !== "output-error" &&
          part.state !== "output-denied";

        return (
          <div
            className={`tool-step ${isRunning ? "running" : ""}`}
            key={part.toolCallId ?? `${part.type}-${index}`}
          >
            <span className="tool-step-number">{index + 1}</span>
            <div className="tool-step-content">
              <div className="tool-step-title">
                <span aria-hidden="true">{details.emoji}</span>
                <strong>{details.label}</strong>
                {args && <code>({args})</code>}
              </div>
              <p>{getToolSummary(part)}</p>
              {image && (
                <div className="generated-inline-image">
                  <img alt={prompt} src={image} />
                  <button onClick={() => downloadImage(image, prompt)} type="button">
                    💾 Pobierz
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function SourceLinks({ sources }: { sources: AgentPart[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <div className="agent-sources" aria-label="Źródła">
      {sources.slice(0, 5).map((source, index) => (
        <a href={source.url} key={`${source.url}-${index}`} rel="noreferrer" target="_blank">
          {source.title || source.url}
        </a>
      ))}
    </div>
  );
}

export default function AgentPage() {
  const [input, setInput] = useState("");
  const [aiModel, setAiModel] = useState<AiModel>("flash");
  const [messageMetrics, setMessageMetrics] = useState<Record<string, number>>({});
  const [messageModels, setMessageModels] = useState<Record<string, AiModel>>({});
  const [liveElapsed, setLiveElapsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sentAtRef = useRef<number | null>(null);
  const submittedModelRef = useRef<AiModel>("flash");
  const {
    clearError,
    error,
    messages,
    sendMessage,
    setMessages,
    status,
  } = useChat({
    onFinish: ({ message }) => {
      const startedAt = sentAtRef.current;

      if (startedAt != null) {
        setMessageMetrics((currentMetrics) => ({
          ...currentMetrics,
          [message.id]: (Date.now() - startedAt) / 1000,
        }));
      }

      sentAtRef.current = null;
      setLiveElapsed(0);
    },
    transport: agentTransport,
  });
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

  const renderedMessages = useMemo<RenderedMessage[]>(
    () =>
      messages.map((message) => {
        const parts = message.parts as AgentPart[];
        const content = getMessageText(parts);
        const knowledgeSource =
          message.role === "assistant" ? splitKnowledgeSource(content) : null;

        return {
          id: message.id,
          model: message.role === "assistant" ? messageModels[message.id] : undefined,
          role: message.role,
          knowledgeSource: knowledgeSource?.knowledgeSource ?? null,
          sources: parts.filter((part) => part.type === "source-url" && part.url),
          text: knowledgeSource?.text ?? content,
          toolParts: parts.filter(isToolPart),
        };
      }),
    [messageModels, messages],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    setMessageModels((currentModels) => {
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

  useEffect(() => {
    if (!isLoading || sentAtRef.current == null) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (sentAtRef.current != null) {
        setLiveElapsed((Date.now() - sentAtRef.current) / 1000);
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [isLoading]);

  async function sendAgentMessage(nextText: string) {
    const rawText = nextText.trim();

    if ((!rawText && !attachedImage) || isLoading) {
      return;
    }

    const text = rawText || "Co widzisz na tym obrazie?";
    setInput("");
    clearError();
    sentAtRef.current = Date.now();
    submittedModelRef.current = aiModel;
    setLiveElapsed(0);

    try {
      await sendMessage(
        { text },
        {
          body: {
            image: attachedImage?.dataUrl,
            mode: "agent",
            model: aiModel,
            userId: getOrCreateUserId(),
          },
        },
      );
      clearAttachedImage();
    } catch {
      sentAtRef.current = null;
      clearError();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendAgentMessage(input);
  }

  function handleNewConversation() {
    clearError();
    setMessages([]);
    setMessageMetrics({});
    setMessageModels({});
    setLiveElapsed(0);
    clearAttachedImage();
  }

  const lastAssistantId = [...renderedMessages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;
  const hasStreamingAssistant =
    isLoading && renderedMessages.at(-1)?.role === "assistant";

  return (
    <main
      className="chat-shell think-shell agent-power-shell"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TopNavigation className="think-nav" />

      <section
        className={`chat-panel think-panel agent-power-panel image-drop-target ${
          isDraggingImage ? "dragging" : ""
        }`}
        aria-label="Agent AI pełna moc"
      >
        <ImageDropOverlay isVisible={isDraggingImage} />

        <header className="chat-header agent-power-header">
          <div className="agent-lockup">
            <div className="brand-mark agent" aria-hidden="true">
              🤖
            </div>
            <div>
              <p className="eyebrow">Multi-tool command center</p>
              <h1>🤖 Agent AI - Pełna moc</h1>
              <p className="agent-description">
                {availableTools.length} narzędzi • autonomiczne decyzje
              </p>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Online
          </div>
        </header>

        <section className="agent-power-grid">
          <aside className="agent-tools-panel" aria-label="Moje narzędzia">
            <div>
              <p className="eyebrow">Moje narzędzia</p>
              <h2>Aktywne moduły</h2>
            </div>
            <div className="tool-list">
              {availableTools.map((item) => (
                <div className="tool-list-item" key={item.name}>
                  <span aria-hidden="true">{item.emoji}</span>
                  <strong>{item.name}</strong>
                  <em>aktywny</em>
                </div>
              ))}
            </div>
          </aside>

          <section className="agent-command-panel">
            <div className="agent-scenarios" aria-label="Scenariusze">
              {scenarios.map((scenario) => (
                <button
                  disabled={isLoading}
                  key={scenario}
                  onClick={() => void sendAgentMessage(scenario)}
                  type="button"
                >
                  {scenario}
                </button>
              ))}
            </div>

            <div className="messages agent-messages" aria-live="polite">
              {renderedMessages.length === 0 ? (
                <div className="empty-state">
                  <p>Wybierz scenariusz albo zleć agentowi własne zadanie.</p>
                </div>
              ) : (
                renderedMessages.map((message) => {
                  const isAssistant = message.role === "assistant";
                  const isCurrentAssistant =
                    isAssistant && isLoading && message.id === lastAssistantId;
                  const duration =
                    messageMetrics[message.id] ??
                    (isCurrentAssistant ? liveElapsed : undefined);

                  return (
                    <article
                      className={`message ${
                        message.role === "user" ? "user" : "assistant markdown-message"
                      }`}
                      key={message.id}
                    >
                      {isAssistant && (
                        <div className="message-badges">
                          <span className="mode-badge agent">🤖 agent</span>
                          <span className={`model-badge ${message.model ?? "flash"}`}>
                            {getAiModelDetails(message.model ?? "flash").badge}
                          </span>
                        </div>
                      )}

                      {isAssistant && <ToolTimeline toolParts={message.toolParts} />}

                      {message.text &&
                        (isAssistant ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.text}
                          </ReactMarkdown>
                        ) : (
                          <p>{message.text}</p>
                        ))}

                      {isAssistant && <SourceLinks sources={message.sources} />}
                      {isAssistant && message.knowledgeSource ? (
                        <a className="knowledge-source" href="/upload">
                          {message.knowledgeSource}
                        </a>
                      ) : null}

                      {isAssistant && (
                        <p className="agent-metrics">
                          Użyto {message.toolParts.length} narzędzi |{" "}
                          {duration == null ? "..." : `${duration.toFixed(1)}s`} |
                          Model: {getAiModelDetails(message.model ?? "flash").badge}
                        </p>
                      )}
                    </article>
                  );
                })
              )}

              {isLoading && !hasStreamingAssistant && (
                <article className="message assistant loading">
                  <div className="message-badges">
                    <span className="mode-badge agent">🤖 agent</span>
                    <span className={`model-badge ${aiModel}`}>
                      {getAiModelDetails(aiModel).badge}
                    </span>
                  </div>
                  <p>Uruchamiam narzędzia...</p>
                </article>
              )}

              {error && (
                <article className="message error">
                  <p>{getReadableErrorMessage(error)}</p>
                </article>
              )}

              <div ref={bottomRef} />
            </div>

            <form className="composer agent-composer" onSubmit={handleSubmit}>
              <ImageAttachmentPreview
                attachedImage={attachedImage}
                onRemove={clearAttachedImage}
              />
              {attachmentError && (
                <p className="attachment-error">{attachmentError}</p>
              )}

              <div className="control-strip" aria-label="Ustawienia odpowiedzi">
                <ModelSelector
                  disabled={isLoading}
                  onChange={setAiModel}
                  value={aiModel}
                />
              </div>

              <div className="composer-row">
                <input
                  aria-label="Zadanie dla agenta"
                  onChange={(event) => setInput(event.target.value)}
                  onPaste={handlePaste}
                  placeholder="Zleć agentowi zadanie wielonarzędziowe..."
                  value={input}
                />

                <input
                  accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                  className="file-input"
                  id="image-upload-agent"
                  onChange={handleFileInputChange}
                  type="file"
                />
                <label
                  aria-label="Wgraj obraz"
                  className="attach-button"
                  htmlFor="image-upload-agent"
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
        </section>

        <section className="memory-panel" aria-label="Akcje agenta">
          <div className="memory-content compact">
            <p className="memory-stat">Wiadomości: {renderedMessages.length}</p>
            <div className="memory-actions">
              <button
                disabled={isLoading || renderedMessages.length === 0}
                onClick={handleNewConversation}
                type="button"
              >
                🗑 Nowe zadanie
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
