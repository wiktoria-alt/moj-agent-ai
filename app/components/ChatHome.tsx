"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ImageAttachmentPreview,
  ImageDropOverlay,
  useImageAttachment,
} from "./ImageAttachment";
import { ModelSelector } from "./ModelSelector";
import { TopNavigation } from "./TopNavigation";
import { getReadableErrorMessage } from "../lib/errors";
import { getAiModelDetails, type AiModel } from "../lib/models";
import { supabase } from "../lib/supabase";

const modes = [
  { id: "casual", label: "Casual", badge: "casual" },
  { id: "ekspert", label: "Ekspert", badge: "ekspert" },
  { id: "kreatywny", label: "Kreatywny", badge: "kreatywny" },
  { id: "search", label: "Szukaj", badge: "szukaj" },
] as const;

const sampleQuestions = [
  "/dokumenty",
  "/naruszenia",
] as const;

type ChatMode = (typeof modes)[number]["id"];
type UserPreferences = Record<string, string>;
type UserProfile = {
  id: string;
  displayName: string | null;
  preferences: UserPreferences;
};


function getMessageText(message: { parts: Array<{ type: string; text?: string }> }) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function splitKnowledgeSource(text: string) {
  const match = text.match(/\n*📎 Źródł(?:o|a):\s*(.+)\s*$/u);

  return match
    ? {
        source: match[0].trim(),
        text: text.slice(0, match.index).trim(),
      }
    : { source: null, text };
}

function getModeDetails(mode: ChatMode) {
  return modes.find((option) => option.id === mode) ?? modes[0];
}

function createConversationTitle(text: string) {
  const normalizedText = text.trim().replace(/\s+/g, " ");

  if (normalizedText.length <= 50) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, 47).trimEnd()}...`;
}

async function copyTextToClipboard(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const wasCopied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (wasCopied) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error("Copy command failed");
}

export default function ChatHome() {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<ChatMode>("ekspert");
  const [aiModel, setAiModel] = useState<AiModel>("flash");
  const [assistantModes, setAssistantModes] = useState<Record<string, ChatMode>>({});
  const [assistantModels, setAssistantModels] = useState<Record<string, AiModel>>({});
  const [copyStatus, setCopyStatus] = useState("");
  const [documentName, setDocumentName] = useState("Brak wgranego pliku");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [persistenceError, setPersistenceError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationIdRef = useRef<string | null>(null);
  const historyLoadStartedRef = useRef(false);
  const profileLoadStartedRef = useRef(false);
  const persistedMessageIdsRef = useRef(new Set<string>());
  const userIdRef = useRef<string | null>(null);
  const submittedModeRef = useRef<ChatMode>("ekspert");
  const submittedModelRef = useRef<AiModel>("flash");
  const { clearError, messages, sendMessage, setMessages, status, error } =
    useChat({
      onFinish: ({ isAbort, isDisconnect, isError, message }) => {
        const conversationId = conversationIdRef.current;
        const userId = userIdRef.current;
        const content = getMessageText(message).trim();

        if (userId) {
          void refreshUserProfile(userId).catch(reportProfileError);
        }

        if (
          !conversationId ||
          message.role !== "assistant" ||
          !content ||
          isAbort ||
          isDisconnect ||
          isError ||
          persistedMessageIdsRef.current.has(message.id)
        ) {
          return;
        }

        persistedMessageIdsRef.current.add(message.id);
        const databaseMessageId = crypto.randomUUID();
        void persistMessage(
          conversationId,
          databaseMessageId,
          "assistant",
          content,
        ).catch((persistenceFailure) => {
          persistedMessageIdsRef.current.delete(message.id);
          reportPersistenceError(persistenceFailure);
        });
      },
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
  const canSend =
    (input.trim().length > 0 || attachedImage != null) &&
    !isLoading &&
    !isHistoryLoading &&
    !isProfileLoading;

  const profileGreeting = isProfileLoading
    ? ""
    : userProfile?.displayName
      ? `Cześć, ${userProfile.displayName}! Miło Cię znowu widzieć!`
      : "Cześć! Nie znamy się jeszcze. Jak masz na imię?";

  function reportPersistenceError(persistenceFailure: unknown) {
    console.error("Supabase persistence error", persistenceFailure);
    const details =
      persistenceFailure instanceof Error
        ? persistenceFailure.message
        : typeof persistenceFailure === "object" &&
            persistenceFailure !== null &&
            "message" in persistenceFailure &&
            typeof persistenceFailure.message === "string"
          ? persistenceFailure.message
          : "";
    setPersistenceError(
      `Nie udało się zsynchronizować rozmowy z Supabase.${details ? ` ${details}` : " Spróbuj ponownie."}`,
    );
  }

  function reportProfileError(profileFailure: unknown) {
    console.error("Supabase profile error", profileFailure);
    const details =
      profileFailure instanceof Error
        ? profileFailure.message
        : typeof profileFailure === "object" &&
            profileFailure !== null &&
            "message" in profileFailure &&
            typeof profileFailure.message === "string"
          ? profileFailure.message
          : "";
    setProfileError(
      `Nie udało się zsynchronizować profilu użytkownika z Supabase.${details ? ` ${details}` : ""}`,
    );
  }

  async function refreshUserProfile(userId: string) {
    const { data, error: profileSelectError } = await supabase
      .from("user_profiles")
        .select("id, display_name, preferences")
      .eq("id", userId)
      .maybeSingle();

    if (profileSelectError) {
      throw profileSelectError;
    }

    if (!data) {
      const { error: profileCreateError } = await supabase
        .from("user_profiles")
        .insert({ id: userId, display_name: null, preferences: {} });

      if (profileCreateError) {
        throw profileCreateError;
      }

      const newProfile: UserProfile = {
        id: userId,
        displayName: null,
        preferences: {},
      };
      setUserProfile(newProfile);
      setProfileError("");
      return newProfile;
    }

    const profile: UserProfile = {
      id: data.id,
      displayName:
        typeof data.display_name === "string" && data.display_name.trim()
          ? data.display_name
          : null,
      preferences:
        data.preferences &&
        typeof data.preferences === "object" &&
        !Array.isArray(data.preferences)
          ? (data.preferences as UserPreferences)
          : {},
    };
    setUserProfile(profile);
    setProfileError("");
    return profile;
  }

  async function ensureConversation(conversationId: string, title?: string) {
    const { error: createError } = await supabase
      .from("conversations")
      .upsert(
        { id: conversationId, title: title ?? null, user_id: userIdRef.current },
        { ignoreDuplicates: true, onConflict: "id" },
      );

    if (createError) {
      throw createError;
    }

    if (title) {
      const { error: titleError } = await supabase
        .from("conversations")
        .update({ title })
        .eq("id", conversationId)
        .is("title", null);

      if (titleError) {
        throw titleError;
      }
    }
  }

  async function persistMessage(
    conversationId: string,
    messageId: string,
    role: "user" | "assistant",
    content: string,
    title?: string,
  ) {
    await ensureConversation(conversationId, title);

    const { error: messageError } = await supabase.from("messages").upsert(
      { content, conversation_id: conversationId, id: messageId, role },
      { ignoreDuplicates: true, onConflict: "id" },
    );

    if (messageError) {
      throw messageError;
    }

    const { error: conversationError } = await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (conversationError) {
      throw conversationError;
    }

    setPersistenceError("");
  }

  const renderedMessages = useMemo(
    () =>
      messages.map((message) => {
        const content = getMessageText(message);
        const knowledgeSource =
          message.role === "assistant" ? splitKnowledgeSource(content) : null;

        return {
          id: message.id,
          role: message.role,
          mode: message.role === "assistant" ? assistantModes[message.id] : undefined,
          model:
            message.role === "assistant" ? assistantModels[message.id] : undefined,
          source: knowledgeSource?.source ?? null,
          text: knowledgeSource?.text ?? content,
        };
      }),
    [assistantModes, assistantModels, messages],
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
    if (profileLoadStartedRef.current) {
      return;
    }

    profileLoadStartedRef.current = true;

    async function initializeUserProfile() {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;
      if (!userId) throw new Error("Brak zalogowanego użytkownika.");

      userIdRef.current = userId;

      try {
        await refreshUserProfile(userId);
      } catch (profileFailure) {
        reportProfileError(profileFailure);
      } finally {
        setIsProfileLoading(false);
      }
    }

    void initializeUserProfile();
  }, []);

  useEffect(() => {
    if (historyLoadStartedRef.current) {
      return;
    }

    historyLoadStartedRef.current = true;

    async function loadLatestConversation() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error("Brak zalogowanego użytkownika.");
        }
        const userId = user.id;
        userIdRef.current = userId;
        const requestedConversationId = new URLSearchParams(
          window.location.search,
        ).get("conversation");
        const requestedIdIsValid =
          requestedConversationId != null &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            requestedConversationId,
          );
        const conversationQuery = requestedIdIsValid
          ? supabase
              .from("conversations")
              .select("id")
              .eq("id", requestedConversationId)
              .eq("user_id", userId)
              .maybeSingle()
          : supabase
            .from("conversations")
            .select("id")
            .eq("user_id", userId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        const { data: latestConversation, error: conversationError } =
          await conversationQuery;

        if (conversationError) {
          throw conversationError;
        }

        if (!latestConversation) {
          return;
        }

        const { data: storedMessages, error: messagesError } = await supabase
          .from("messages")
          .select("id, role, content")
          .eq("conversation_id", latestConversation.id)
          .order("created_at", { ascending: true });

        if (messagesError) {
          throw messagesError;
        }

        const restoredMessages: UIMessage[] = (storedMessages ?? [])
          .filter(
            (storedMessage) =>
              storedMessage.role === "user" || storedMessage.role === "assistant",
          )
          .map((storedMessage) => ({
            id: storedMessage.id,
            parts: [{ text: storedMessage.content ?? "", type: "text" }],
            role: storedMessage.role as "user" | "assistant",
          }));

        conversationIdRef.current = latestConversation.id;
        persistedMessageIdsRef.current = new Set(
          restoredMessages.map((storedMessage) => storedMessage.id),
        );
        setMessages(restoredMessages);
        setPersistenceError("");
      } catch (historyError) {
        reportPersistenceError(historyError);
      } finally {
        setIsHistoryLoading(false);
      }
    }

    void loadLatestConversation();
  }, [setMessages]);

  useEffect(() => {
    setAssistantModes((currentModes) => {
      let hasChanges = false;
      const nextModes = { ...currentModes };

      for (const message of messages) {
        if (message.role === "assistant" && nextModes[message.id] == null) {
          nextModes[message.id] = submittedModeRef.current;
          hasChanges = true;
        }
      }

      return hasChanges ? nextModes : currentModes;
    });

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
    if (
      (!rawText && !attachedImage) ||
      isLoading ||
      isHistoryLoading ||
      isProfileLoading
    ) {
      return;
    }

    const text = rawText || "Co widzisz na tym obrazie?";
    const selectedMode = mode;
    const selectedModel = aiModel;
    submittedModeRef.current = selectedMode;
    submittedModelRef.current = selectedModel;
    setInput("");
    setPersistenceError("");

    let conversationId = conversationIdRef.current;
    if (!conversationId) {
      conversationId = crypto.randomUUID();
      conversationIdRef.current = conversationId;
    }

    const userMessageId = crypto.randomUUID();
    const title = messages.length === 0 ? createConversationTitle(text) : undefined;
    persistedMessageIdsRef.current.add(userMessageId);
    void persistMessage(conversationId, userMessageId, "user", text, title).catch(
      (persistenceFailure) => {
        persistedMessageIdsRef.current.delete(userMessageId);
        reportPersistenceError(persistenceFailure);
      },
    );
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await sendMessage(
        { text },
        {
          body: {
            image: attachedImage?.dataUrl,
            mode: selectedMode,
            model: selectedModel,
            userId: userIdRef.current,
          },
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
        },
      );
      clearAttachedImage();
    } catch {
      clearError();
    }
  }

  function handleNewConversation() {
    if (isLoading || isHistoryLoading || isProfileLoading) {
      return;
    }

    const conversationId = crypto.randomUUID();
    conversationIdRef.current = conversationId;
    void ensureConversation(conversationId).catch(reportPersistenceError);
    clearError();
    setMessages([]);
    setAssistantModes({});
    setAssistantModels({});
    setCopyStatus("");
    setPersistenceError("");
    clearAttachedImage();
  }

  async function handleExportConversation() {
    const transcript =
      renderedMessages
        .map((message) => `${message.role === "user" ? "User" : "Agent"}: ${message.text}`)
        .join("\n") || "Brak wiadomości.";

    try {
      await copyTextToClipboard(transcript);
      setCopyStatus("Skopiowano");
      window.setTimeout(() => setCopyStatus(""), 1800);
    } catch {
      setCopyStatus("Nie udało się skopiować");
    }
  }

  function handleSampleQuestion(question: string) {
    clearError();
    setInput(question);
  }

  return (
    <main className="chat-shell">
      <TopNavigation />

      <section className="agent-hero" aria-label="Marta — Ekspert SKD">
        <img
          alt="Marta — ekspert SKD"
          className="agent-avatar"
          src="/wiktoria-avatar.png"
        />
        <div className="hero-copy">
          <p className="eyebrow">Analiza kredytowa</p>
          <h1>MARTA — EKSPERT SKD</h1>
          <p className="agent-description">
            Ekspert od sankcji kredytu darmowego. Zapytaj o umowę, RRSO,
            całkowity koszt kredytu albo dokumenty do weryfikacji.
          </p>
          <div className="sample-questions" aria-label="Przykładowe pytania">
            {sampleQuestions.map((question) => (
              <button
                disabled={isLoading || isHistoryLoading || isProfileLoading}
                key={question}
                onClick={() => handleSampleQuestion(question)}
                type="button"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace-grid" aria-label="Panel agenta SKD">
        <aside className="document-card" aria-label="Status dokumentu">
          <div>
            <p className="eyebrow">Status Dokumentu</p>
            <h2>Analiza umowy</h2>
          </div>

          <div className="document-file">
            <span>Nazwa pliku</span>
            <strong>{documentName}</strong>
          </div>

          <div className="progress-block">
            <div className="progress-heading">
              <span>Postęp analizy</span>
              <strong>{analysisProgress}%</strong>
            </div>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: `${analysisProgress}%` }} />
            </div>
          </div>

          <div className="document-meta">
            <span>Wiadomości: {contextStats.messages}</span>
            <span>~Tokeny: {contextStats.tokens}</span>
          </div>

          <div className="sidebar-actions">
            <button
              disabled={isLoading || isHistoryLoading || isProfileLoading}
              onClick={handleNewConversation}
              type="button"
            >
              + Nowa rozmowa
            </button>
            <button
              disabled={renderedMessages.length === 0}
              onClick={handleExportConversation}
              type="button"
            >
              Eksport
            </button>
          </div>
          {copyStatus && <p className="copy-status">{copyStatus}</p>}
          {persistenceError && (
            <p className="persistence-status" role="status">
              {persistenceError}
            </p>
          )}
          {profileError && (
            <p className="persistence-status" role="status">
              {profileError}
            </p>
          )}
        </aside>

        <section
          className={`chat-panel image-drop-target ${isDraggingImage ? "dragging" : ""}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          aria-label="Czat z agentem AI"
        >
          <ImageDropOverlay isVisible={isDraggingImage} />
          <div className="messages" aria-live="polite">
            {!isProfileLoading && profileGreeting && (
              <article className="message assistant profile-greeting">
                <div className="message-badges">
                  <span className="mode-badge ekspert">profil</span>
                </div>
                <p>{profileGreeting}</p>
              </article>
            )}

            {isHistoryLoading || isProfileLoading ? (
              <div className="history-loading" role="status">
                <span aria-hidden="true" className="history-spinner" />
                <p>Wczytuję profil i ostatnią rozmowę...</p>
              </div>
            ) : renderedMessages.length === 0 ? (
              <div className="empty-state">
                <p>Zadaj pytanie o sankcję kredytu darmowego.</p>
              </div>
            ) : (
              renderedMessages.map((message) => (
                <article
                  className={`message ${message.role === "user" ? "user" : "assistant"}`}
                  key={message.id}
                >
                  {message.role === "assistant" && (
                    <div className="message-badges">
                      <span className={`mode-badge ${message.mode ?? "ekspert"}`}>
                        {getModeDetails(message.mode ?? "ekspert").badge}
                      </span>
                      <span className={`model-badge ${message.model ?? "flash"}`}>
                        {getAiModelDetails(message.model ?? "flash").badge}
                      </span>
                    </div>
                  )}
                  {message.text ? <p>{message.text}</p> : null}
                  {message.source ? (
                    <a className="knowledge-source" href="/upload">
                      {message.source}
                    </a>
                  ) : null}
                </article>
              ))
            )}

            {isLoading && (
              <article className="message assistant loading">
                <div className="message-badges">
                  <span className={`mode-badge ${mode}`}>
                    {getModeDetails(mode).badge}
                  </span>
                  <span className={`model-badge ${aiModel}`}>
                    {getAiModelDetails(aiModel).badge}
                  </span>
                </div>
                <p>Analizuję...</p>
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
                disabled={isLoading || isHistoryLoading || isProfileLoading}
                onChange={setAiModel}
                value={aiModel}
              />

              <label className="style-select">
                <span>Styl</span>
                <select
                  disabled={isHistoryLoading || isProfileLoading}
                  onChange={(event) => setMode(event.target.value as ChatMode)}
                  value={mode}
                >
                  {modes.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="composer-row">
              <input
                aria-label="Wiadomość"
                disabled={isHistoryLoading || isProfileLoading}
                onChange={(event) => setInput(event.target.value)}
                onPaste={handlePaste}
                placeholder="Opisz umowę albo zadaj pytanie..."
                value={input}
              />

              <input
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                className="file-input"
                disabled={isHistoryLoading || isProfileLoading}
                id="image-upload-chat"
                onChange={handleFileInputChange}
                type="file"
              />
              <label
                aria-label="Wgraj obraz"
                className="attach-button"
                htmlFor="image-upload-chat"
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
      </section>
    </main>
  );
}


