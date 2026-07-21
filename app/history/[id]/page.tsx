"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TopNavigation } from "../../components/TopNavigation";
import { supabase } from "../../lib/supabase";

type ConversationDetails = {
  id: string;
  title: string;
  updatedAt: string;
};

type ConversationMessage = {
  content: string;
  createdAt: string;
  id: string;
  role: "assistant" | "user";
};

function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function HistoryDetailsPage() {
  const params = useParams<{ id: string }>();
  const conversationId = params.id;
  const [conversation, setConversation] = useState<ConversationDetails | null>(
    null,
  );
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadConversation() {
      setIsLoading(true);
      setError("");

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Brak zalogowanego użytkownika.");
        const { data: conversationRow, error: conversationError } = await supabase
          .from("conversations")
          .select("id, title, updated_at")
          .eq("id", conversationId)
          .eq("user_id", user.id)
          .maybeSingle();

        if (conversationError) {
          throw conversationError;
        }

        if (!conversationRow) {
          setError("Nie znaleziono tej rozmowy.");
          return;
        }

        const { data: messageRows, error: messagesError } = await supabase
          .from("messages")
          .select("id, role, content, created_at")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (messagesError) {
          throw messagesError;
        }

        setConversation({
          id: conversationRow.id,
          title: conversationRow.title?.trim() || "Rozmowa bez tytułu",
          updatedAt: conversationRow.updated_at,
        });
        setMessages(
          (messageRows ?? [])
            .filter(
              (message) =>
                message.role === "user" || message.role === "assistant",
            )
            .map((message) => ({
              content: message.content ?? "",
              createdAt: message.created_at,
              id: message.id,
              role: message.role as "assistant" | "user",
            })),
        );
      } catch (loadError) {
        console.error("Conversation details error", loadError);
        setError("Nie udało się wczytać rozmowy.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadConversation();
  }, [conversationId]);

  return (
    <main className="history-shell">
      <TopNavigation />

      <div className="history-detail-actions">
        <Link href="/history">← Wróć do listy</Link>
        {conversation && (
          <Link
            className="history-continue-link"
            href={`/chat?conversation=${conversation.id}`}
          >
            🔄 Kontynuuj rozmowę
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="history-page-loading" role="status">
          <span aria-hidden="true" className="history-spinner" />
          <p>Wczytuję rozmowę...</p>
        </div>
      ) : error ? (
        <section className="history-empty">
          <h1>{error}</h1>
          <Link className="history-start-link" href="/history">
            Przejdź do historii
          </Link>
        </section>
      ) : conversation ? (
        <>
          <header className="history-detail-header">
            <p className="eyebrow">Podgląd rozmowy</p>
            <h1>{conversation.title}</h1>
            <time dateTime={conversation.updatedAt}>
              Ostatnia aktywność: {formatFullDate(conversation.updatedAt)}
            </time>
          </header>

          <section className="history-transcript" aria-label="Wiadomości rozmowy">
            {messages.length === 0 ? (
              <p className="history-no-messages">Ta rozmowa nie ma wiadomości.</p>
            ) : (
              messages.map((message) => (
                <article
                  className={`history-message ${message.role}`}
                  key={message.id}
                >
                  <div className="history-message-meta">
                    <strong>{message.role === "user" ? "Ty" : "Agent"}</strong>
                    <time dateTime={message.createdAt}>
                      {formatMessageTime(message.createdAt)}
                    </time>
                  </div>
                  <p>{message.content}</p>
                </article>
              ))
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
