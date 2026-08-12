"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { TopNavigation } from "../components/TopNavigation";
import { supabase } from "../lib/supabase";

type Briefing = {
  content: string;
  created_at: string;
  date: string;
  id: string;
};

function formatBriefingDate(value: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "full",
  }).format(new Date(`${value}T12:00:00`));
}

function getPreview(content: string) {
  return content
    .replace(/[#>*_`-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);
}

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const selectedBriefing = useMemo(
    () => briefings.find((briefing) => briefing.id === selectedId) ?? null,
    [briefings, selectedId],
  );

  useEffect(() => {
    void loadBriefings();
  }, []);

  async function loadBriefings(nextSelectedId?: string) {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/briefings");
      const data = (await response.json()) as {
        briefings?: Briefing[];
        error?: string;
      };

      if (!response.ok || data.error) {
        throw new Error(data.error ?? "Nie udało się pobrać briefingów.");
      }

      const nextBriefings = data.briefings ?? [];
      setBriefings(nextBriefings);

      if (nextSelectedId) {
        setSelectedId(nextSelectedId);
      } else if (selectedId && !nextBriefings.some((briefing) => briefing.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Nie udało się pobrać briefingów.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function generateNow() {
    if (isGenerating) {
      return;
    }

    setIsGenerating(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch("/api/cron/morning", {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      const data = (await response.json()) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "Nie udało się wygenerować briefingu.");
      }

      await loadBriefings();
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Nie udało się wygenerować briefingu.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function copySelectedBriefing() {
    if (!selectedBriefing) {
      return;
    }

    await navigator.clipboard.writeText(selectedBriefing.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="chat-shell briefings-shell">
      <TopNavigation className="think-nav" />

      <section className="briefings-panel" aria-label="Briefingi">
        <header className="briefings-header">
          <div>
            <p className="eyebrow">Automatyczny agent</p>
            <h1>📰 Briefingi</h1>
            <p className="agent-description">
              Poranny briefing SKD: sprawy, dokumenty, ryzyka i zadania na dziś.
            </p>
          </div>
          <button disabled={isGenerating} onClick={() => void generateNow()} type="button">
            {isGenerating ? "Generuję..." : "🔄 Wygeneruj teraz"}
          </button>
        </header>

        {error && <p className="briefings-error">{error}</p>}

        {selectedBriefing ? (
          <article className="briefing-detail markdown-message">
            <div className="briefing-detail-actions">
              <button onClick={() => setSelectedId(null)} type="button">
                ← Wróć do listy
              </button>
              <button onClick={() => void copySelectedBriefing()} type="button">
                {copied ? "Skopiowano" : "📋 Kopiuj"}
              </button>
            </div>

            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {selectedBriefing.content}
            </ReactMarkdown>
          </article>
        ) : (
          <section className="briefings-list" aria-live="polite">
            {isLoading ? (
              <div className="briefings-empty">
                <p>Ładuję briefingi...</p>
              </div>
            ) : briefings.length === 0 ? (
              <div className="briefings-empty">
                <p>Brak briefingów. Cron job wygeneruje pierwszy jutro rano!</p>
                <button disabled={isGenerating} onClick={() => void generateNow()} type="button">
                  {isGenerating ? "Generuję..." : "🔄 Wygeneruj teraz"}
                </button>
              </div>
            ) : (
              briefings.map((briefing) => (
                <button
                  className="briefing-card"
                  key={briefing.id}
                  onClick={() => setSelectedId(briefing.id)}
                  type="button"
                >
                  <span className="briefing-date">{formatBriefingDate(briefing.date)}</span>
                  <strong>{getPreview(briefing.content)}</strong>
                  <em>Otwórz cały briefing</em>
                  <span className="briefing-status">✅ wygenerowany automatycznie</span>
                </button>
              ))
            )}
          </section>
        )}
      </section>
    </main>
  );
}
