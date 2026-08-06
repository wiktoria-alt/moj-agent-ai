"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TopNavigation } from "../components/TopNavigation";

type NewsItem = {
  category: "news" | "tsue" | "judgment";
  description: string;
  link: string;
  publishedAt: string | null;
  source: string;
  title: string;
};

type NewsResponse = {
  error?: string;
  items?: NewsItem[];
  updatedAt?: string;
};

const categoryLabels: Record<NewsItem["category"], string> = {
  judgment: "Wyrok / orzeczenie",
  news: "News",
  tsue: "TSUE",
};

const categoryDescriptions: Record<NewsItem["category"], string> = {
  judgment: "Orzeczenia sądów i materiały o najważniejszych sprawach SKD.",
  news: "Aktualności rynkowe, komentarze i zmiany wokół kredytów konsumenckich.",
  tsue: "Sprawy TSUE, które mogą zmieniać praktykę banków i sądów.",
};

function formatDate(value: string | null) {
  if (!value) return "brak daty";

  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function cleanDescription(value: string) {
  return value
    .replace(/\s+-\s+.+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

export default function SkdNewsPage() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<"all" | NewsItem["category"]>(
    "all",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadNews = useCallback(async () => {
    setIsRefreshing(true);
    setError("");

    try {
      const response = await fetch("/api/skd-news", { cache: "no-store" });
      const data = (await response.json()) as NewsResponse;

      if (!response.ok) {
        throw new Error(data.error || "Nie udało się pobrać newsów SKD.");
      }

      setItems(data.items ?? []);
      setUpdatedAt(data.updatedAt ?? null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Nie udało się pobrać newsów SKD.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadNews();

    const interval = window.setInterval(() => {
      void loadNews();
    }, 30 * 60 * 1000);

    return () => window.clearInterval(interval);
  }, [loadNews]);

  const filteredItems = useMemo(
    () =>
      activeCategory === "all"
        ? items
        : items.filter((item) => item.category === activeCategory),
    [activeCategory, items],
  );

  const featuredItem = items[0];

  return (
    <main className="chat-shell skd-news-shell">
      <TopNavigation />

      <section className="skd-news-panel" aria-label="Newsy o SKD">
        <header className="skd-news-hero">
          <div>
            <p className="eyebrow">Radar SKD</p>
            <h1>🗞️ NEWSY o SKD</h1>
            <p>
              Najnowsze i najważniejsze informacje o sankcji kredytu darmowego,
              TSUE oraz orzeczeniach. Lista odświeża się automatycznie co 30 minut.
            </p>
          </div>
          <button disabled={isRefreshing} onClick={() => void loadNews()} type="button">
            {isRefreshing ? "Odświeżam..." : "Odśwież teraz"}
          </button>
        </header>

        <section className="skd-news-summary" aria-label="Najważniejszy temat">
          <article>
            <span>Najważniejsze teraz</span>
            <h2>{featuredItem?.title ?? "Ładowanie najnowszych informacji..."}</h2>
            <p>
              {featuredItem
                ? cleanDescription(featuredItem.description) ||
                  categoryDescriptions[featuredItem.category]
                : "Zbieram aktualne wyniki z Google News."}
            </p>
            {featuredItem ? (
              <a href={featuredItem.link} rel="noreferrer" target="_blank">
                Czytaj źródło →
              </a>
            ) : null}
          </article>

          <div className="skd-news-stats">
            <div>
              <strong>{items.length}</strong>
              <span>znalezionych materiałów</span>
            </div>
            <div>
              <strong>{items.filter((item) => item.category === "judgment").length}</strong>
              <span>wyroków / orzeczeń</span>
            </div>
            <div>
              <strong>{items.filter((item) => item.category === "tsue").length}</strong>
              <span>wątków TSUE</span>
            </div>
          </div>
        </section>

        <div className="skd-news-filters" aria-label="Filtry newsów">
          {(["all", "judgment", "tsue", "news"] as const).map((category) => (
            <button
              className={activeCategory === category ? "active" : ""}
              key={category}
              onClick={() => setActiveCategory(category)}
              type="button"
            >
              {category === "all" ? "Wszystko" : categoryLabels[category]}
            </button>
          ))}
        </div>

        {updatedAt ? (
          <p className="skd-news-updated">
            Ostatnie odświeżenie: {formatDate(updatedAt)}
          </p>
        ) : null}

        {error ? <p className="skd-news-error">{error}</p> : null}

        <section className="skd-news-list" aria-live="polite">
          {isLoading ? (
            <p className="skd-news-empty">Ładuję najnowsze informacje o SKD...</p>
          ) : filteredItems.length ? (
            filteredItems.map((item) => (
              <article className={`skd-news-item ${item.category}`} key={item.link}>
                <div>
                  <span>{categoryLabels[item.category]}</span>
                  <small>
                    {item.source} · {formatDate(item.publishedAt)}
                  </small>
                </div>
                <h2>{item.title}</h2>
                <p>
                  {cleanDescription(item.description) ||
                    categoryDescriptions[item.category]}
                </p>
                <a href={item.link} rel="noreferrer" target="_blank">
                  Otwórz źródło
                </a>
              </article>
            ))
          ) : (
            <p className="skd-news-empty">
              Brak wyników w tej kategorii. Kliknij „Odśwież teraz” albo sprawdź później.
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
