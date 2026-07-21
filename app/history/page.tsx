"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TopNavigation } from "../components/TopNavigation";
import { supabase } from "../lib/supabase";

type HistoryMessage = {
  content: string;
  createdAt: string;
};

type HistoryConversation = {
  id: string;
  messages: HistoryMessage[];
  title: string;
  updatedAt: string;
};

function formatActivityDate(value: string) {
  const date = new Date(value);
  const differenceMs = date.getTime() - Date.now();
  const differenceMinutes = Math.round(differenceMs / 60_000);
  const relative = new Intl.RelativeTimeFormat("pl-PL", { numeric: "auto" });

  if (Math.abs(differenceMinutes) < 1) {
    return "przed chwilą";
  }

  if (Math.abs(differenceMinutes) < 60) {
    return relative.format(differenceMinutes, "minute");
  }

  const differenceHours = Math.round(differenceMinutes / 60);
  if (Math.abs(differenceHours) < 24) {
    return relative.format(differenceHours, "hour");
  }

  const differenceDays = Math.round(differenceHours / 24);
  if (Math.abs(differenceDays) <= 1) {
    return relative.format(differenceDays, "day");
  }

  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function shorten(text: string, maximumLength = 100) {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length <= maximumLength
    ? normalized
    : `${normalized.slice(0, maximumLength - 3).trimEnd()}...`;
}

function Highlight({ query, text }: { query: string; text: string }) {
  const normalizedQuery = query.trim();
  const index = text.toLocaleLowerCase("pl-PL").indexOf(
    normalizedQuery.toLocaleLowerCase("pl-PL"),
  );

  if (!normalizedQuery || index < 0) {
    return text;
  }

  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + normalizedQuery.length)}</mark>
      {text.slice(index + normalizedQuery.length)}
    </>
  );
}

export default function HistoryPage() {
  const [conversations, setConversations] = useState<HistoryConversation[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");

  const loadConversations = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      const { data: conversationRows, error: conversationsError } = await supabase
        .from("conversations")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });

      if (conversationsError) {
        throw conversationsError;
      }

      const ids = (conversationRows ?? []).map((conversation) => conversation.id);
      const messagesByConversation = new Map<string, HistoryMessage[]>();

      if (ids.length > 0) {
        const { data: messageRows, error: messagesError } = await supabase
          .from("messages")
          .select("conversation_id, content, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: true });

        if (messagesError) {
          throw messagesError;
        }

        for (const message of messageRows ?? []) {
          const currentMessages =
            messagesByConversation.get(message.conversation_id) ?? [];
          currentMessages.push({
            content: message.content ?? "",
            createdAt: message.created_at,
          });
          messagesByConversation.set(message.conversation_id, currentMessages);
        }
      }

      setConversations(
        (conversationRows ?? []).map((conversation) => ({
          id: conversation.id,
          messages: messagesByConversation.get(conversation.id) ?? [],
          title: conversation.title?.trim() || "Rozmowa bez tytułu",
          updatedAt: conversation.updated_at,
        })),
      );
    } catch (loadError) {
      console.error("History load error", loadError);
      setError("Nie udało się wczytać historii rozmów.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const filteredConversations = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pl-PL");

    if (!normalizedQuery) {
      return conversations;
    }

    return conversations.filter(
      (conversation) =>
        conversation.title.toLocaleLowerCase("pl-PL").includes(normalizedQuery) ||
        conversation.messages.some((message) =>
          message.content.toLocaleLowerCase("pl-PL").includes(normalizedQuery),
        ),
    );
  }, [conversations, query]);

  function getPreview(conversation: HistoryConversation) {
    const normalizedQuery = query.trim().toLocaleLowerCase("pl-PL");
    const matchingMessage = normalizedQuery
      ? conversation.messages.find((message) =>
          message.content.toLocaleLowerCase("pl-PL").includes(normalizedQuery),
        )
      : null;
    const latestMessage = conversation.messages.at(-1);
    return shorten(
      matchingMessage?.content || latestMessage?.content || "Brak wiadomości",
    );
  }

  async function deleteConversation(conversationId: string) {
    const confirmed = window.confirm(
      "Czy na pewno chcesz usunąć tę rozmowę? Tej operacji nie można cofnąć.",
    );

    if (!confirmed) {
      return;
    }

    setError("");
    const { error: messagesDeleteError } = await supabase
      .from("messages")
      .delete()
      .eq("conversation_id", conversationId);

    if (messagesDeleteError) {
      setError("Nie udało się usunąć wiadomości rozmowy.");
      return;
    }

    const { error: conversationDeleteError } = await supabase
      .from("conversations")
      .delete()
      .eq("id", conversationId);

    if (conversationDeleteError) {
      setError("Nie udało się usunąć rozmowy.");
      return;
    }

    setConversations((current) =>
      current.filter((conversation) => conversation.id !== conversationId),
    );
    setToast("Rozmowa usunięta");
    window.setTimeout(() => setToast(""), 2400);
  }

  return (
    <main className="history-shell">
      <TopNavigation />

      <header className="history-header">
        <div>
          <p className="eyebrow">Archiwum agenta</p>
          <h1>📜 Historia rozmów</h1>
          <p>Wszystkie Twoje rozmowy z agentem</p>
        </div>
        <Link className="history-start-link" href="/chat">
          + Nowa rozmowa
        </Link>
      </header>

      <label className="history-search">
        <span className="sr-only">Szukaj w rozmowach</span>
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Szukaj w rozmowach..."
          type="search"
          value={query}
        />
      </label>

      {error && <p className="history-error">{error}</p>}

      {isLoading ? (
        <div className="history-page-loading" role="status">
          <span aria-hidden="true" className="history-spinner" />
          <p>Wczytuję rozmowy...</p>
        </div>
      ) : filteredConversations.length === 0 ? (
        <section className="history-empty">
          <h2>{query ? "Brak pasujących rozmów" : "Nie masz jeszcze żadnych rozmów."}</h2>
          <p>{query ? "Spróbuj użyć innego hasła." : "Zacznij nową!"}</p>
          {!query && (
            <Link className="history-start-link" href="/chat">
              Rozpocznij rozmowę
            </Link>
          )}
        </section>
      ) : (
        <section className="history-grid" aria-label="Lista rozmów">
          {filteredConversations.map((conversation) => {
            const preview = getPreview(conversation);

            return (
              <article className="history-card" key={conversation.id}>
                <Link
                  aria-label={`Otwórz rozmowę: ${conversation.title}`}
                  className="history-card-link"
                  href={`/history/${conversation.id}`}
                >
                  <h2>
                    <Highlight query={query} text={conversation.title} />
                  </h2>
                  <div className="history-card-meta">
                    <time dateTime={conversation.updatedAt}>
                      {formatActivityDate(conversation.updatedAt)}
                    </time>
                    <span>
                      {conversation.messages.length} {conversation.messages.length === 1 ? "wiadomość" : "wiadomości"}
                    </span>
                  </div>
                  <p className="history-preview">
                    <Highlight query={query} text={preview} />
                  </p>
                </Link>
                <button
                  aria-label={`Usuń rozmowę: ${conversation.title}`}
                  className="history-delete"
                  onClick={() => void deleteConversation(conversation.id)}
                  type="button"
                >
                  🗑️ Usuń
                </button>
              </article>
            );
          })}
        </section>
      )}

      {toast && (
        <div className="history-toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
