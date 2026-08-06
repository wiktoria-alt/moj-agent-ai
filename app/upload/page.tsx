"use client";

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TopNavigation } from "../components/TopNavigation";
import { supabase } from "../lib/supabase";

type StoredDocument = {
  chunks: number;
  created_at: string;
  title: string;
};

type DocumentFragment = {
  content: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
  title: string;
};

type KnowledgeSearchResult = {
  added_at: string | null;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  title: string;
};

type ProgressEvent = {
  chunks_saved?: number;
  current?: number;
  error?: string;
  total?: number;
  type: "start" | "progress" | "complete" | "error";
};

const examples = [
  {
    label: "SKD checklista",
    title: "SKD — podstawowa checklista",
    content:
      "Sankcja kredytu darmowego może być analizowana przy kredycie konsumenckim. W pierwszym kroku sprawdź: datę zawarcia umowy, kwotę kredytu, status spłaty, termin roczny od wykonania umowy, RRSO, całkowity koszt kredytu, prowizję, zasady wcześniejszej spłaty, harmonogram i formularz informacyjny. Wynik analizy nie jest gwarancją wygranej — wymaga oceny dokumentów.",
  },
  {
    label: "FAQ klienta",
    title: "SKD — FAQ klienta",
    content:
      "P: Czy każda umowa kredytu daje SKD? O: Nie. Najpierw trzeba sprawdzić, czy to kredyt konsumencki i czy umowa zawiera naruszenia obowiązków informacyjnych. P: Jakie dokumenty przygotować? O: Umowę kredytu, formularz informacyjny, harmonogram, aneksy, potwierdzenia spłaty, korespondencję z bankiem. P: Czy agent zastępuje prawnika? O: Nie, agent robi wstępną analizę i pomaga przygotować materiał do dalszej oceny.",
  },
  {
    label: "Wzór pisma",
    title: "SKD — szkic oświadczenia",
    content:
      "Oświadczenie o skorzystaniu z sankcji kredytu darmowego powinno zawierać dane konsumenta, dane kredytodawcy, numer umowy, datę zawarcia umowy, wskazanie podstawy prawnej, opis zauważonych naruszeń oraz żądanie rozliczenia kredytu bez odsetek i kosztów. Przed wysyłką dokument powinien zostać sprawdzony przez osobę kompetentną.",
  },
] as const;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

async function fetchDocuments() {
  const response = await fetch("/api/documents", {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });
  const data = (await response.json()) as {
    documents?: StoredDocument[];
    error?: string;
  };
  if (!response.ok) throw new Error(data.error || "Nie udało się pobrać dokumentów.");
  return data.documents ?? [];
}

async function fetchDocumentFragments(title: string) {
  const response = await fetch(`/api/documents?title=${encodeURIComponent(title)}`, {
    cache: "no-store",
    headers: await getAuthHeaders(),
  });
  const data = (await response.json()) as {
    error?: string;
    fragments?: DocumentFragment[];
  };
  if (!response.ok) {
    throw new Error(data.error || "Nie udało się pobrać fragmentów dokumentu.");
  }
  return data.fragments ?? [];
}

export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [fragments, setFragments] = useState<DocumentFragment[]>([]);
  const [isFragmentsLoading, setIsFragmentsLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [isListLoading, setIsListLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [selectedDocumentTitle, setSelectedDocumentTitle] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [notice, setNotice] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const refreshDocuments = useCallback(async () => {
    setDocuments(await fetchDocuments());
  }, []);

  useEffect(() => {
    let active = true;

    fetchDocuments()
      .then((items) => {
        if (active) setDocuments(items);
      })
      .catch((error: unknown) => {
        if (active) {
          setNotice({
            kind: "error",
            text:
              error instanceof Error
                ? error.message
                : "Nie udało się pobrać dokumentów.",
          });
        }
      })
      .finally(() => {
        if (active) setIsListLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    setIsLoading(true);
    setNotice(null);
    setProgress({ current: 0, total: 0 });

    try {
      const response = await fetch("/api/upload-knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ title, content }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Nie udało się przetworzyć dokumentu.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let saved = 0;

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const rawLine of lines) {
          if (!rawLine.trim()) continue;
          const update = JSON.parse(rawLine) as ProgressEvent;

          if (update.type === "start") {
            setProgress({ current: 0, total: update.total ?? 0 });
          } else if (update.type === "progress") {
            setProgress({
              current: update.current ?? 0,
              total: update.total ?? 0,
            });
          } else if (update.type === "complete") {
            saved = update.chunks_saved ?? 0;
          } else if (update.type === "error") {
            throw new Error(update.error || "Nie udało się zapisać dokumentu.");
          }
        }

        if (done) break;
      }

      setNotice({
        kind: "success",
        text: `✅ Zapisano ${saved} ${saved === 1 ? "fragment" : "fragmentów"}!`,
      });
      setTitle("");
      setContent("");
      await refreshDocuments();
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać dokumentu.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || isPdfLoading || isLoading) {
      return;
    }

    setIsPdfLoading(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/extract-pdf", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as {
        error?: string;
        fileName?: string;
        pages?: number | null;
        text?: string;
      };

      if (!response.ok || !data.text) {
        throw new Error(data.error || "Nie udało się odczytać PDF.");
      }

      const cleanName = (data.fileName || file.name).replace(/\.pdf$/i, "").trim();
      if (!title.trim()) {
        setTitle(cleanName || "Dokument PDF");
      }
      setContent(data.text);
      setNotice({
        kind: "success",
        text: `✅ Odczytano PDF${data.pages ? ` (${data.pages} stron)` : ""}. Sprawdź tekst i kliknij „Zapisz w bazie wiedzy”.`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się odczytać PDF.",
      });
    } finally {
      setIsPdfLoading(false);
    }
  }

  async function deleteDocument(documentTitle: string) {
    if (!window.confirm(`Usunąć dokument „${documentTitle}” i wszystkie jego fragmenty?`)) {
      return;
    }

    try {
      const response = await fetch("/api/documents", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ title: documentTitle }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Nie udało się usunąć dokumentu.");

      setDocuments((items) => items.filter((item) => item.title !== documentTitle));
      setNotice({ kind: "success", text: `Usunięto „${documentTitle}”.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się usunąć dokumentu.",
      });
    }
  }

  async function selectDocument(documentTitle: string) {
    if (selectedDocumentTitle === documentTitle) {
      setSelectedDocumentTitle(null);
      setFragments([]);
      return;
    }

    setSelectedDocumentTitle(documentTitle);
    setIsFragmentsLoading(true);

    try {
      setFragments(await fetchDocumentFragments(documentTitle));
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać fragmentów dokumentu.",
      });
    } finally {
      setIsFragmentsLoading(false);
    }
  }

  async function searchKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();

    if (!query || isSearching) return;

    setIsSearching(true);
    setHasSearched(true);
    setNotice(null);

    try {
      const response = await fetch("/api/search-knowledge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(await getAuthHeaders()),
        },
        body: JSON.stringify({ query }),
      });
      const data = (await response.json()) as {
        error?: string;
        results?: KnowledgeSearchResult[];
      };

      if (!response.ok) {
        throw new Error(data.error || "Nie udało się przeszukać bazy wiedzy.");
      }

      setSearchResults(data.results ?? []);
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się przeszukać bazy wiedzy.",
      });
    } finally {
      setIsSearching(false);
    }
  }

  const progressPercent = progress.total
    ? Math.round((progress.current / progress.total) * 100)
    : 0;
  const totalFragments = documents.reduce((sum, document) => sum + document.chunks, 0);

  return (
    <main className="chat-shell knowledge-shell">
      <TopNavigation />

      <header className="knowledge-hero">
        <div>
          <p className="eyebrow">Ingestia wiedzy</p>
          <h1>📚 Baza wiedzy SKD</h1>
        </div>
        <p>
          Dodaj ustawę, checklistę, wzór pisma albo PDF z materiałami SKD.
          Agent podzieli treść na fragmenty i będzie odpowiadał na podstawie źródeł.
        </p>
      </header>

      <section className="knowledge-grid">
        <form className="knowledge-card knowledge-form" onSubmit={handleSubmit}>
          <div className="knowledge-field">
            <label htmlFor="knowledge-title">Tytuł dokumentu</label>
            <input
              disabled={isLoading}
              id="knowledge-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Np. SKD — ustawa, checklista, wzór reklamacji"
              required
              value={title}
            />
          </div>

          <div className="knowledge-field">
            <label htmlFor="knowledge-content">Treść dokumentu</label>
            <textarea
              disabled={isLoading}
              id="knowledge-content"
              onChange={(event) => setContent(event.target.value)}
              placeholder="Wklej tutaj treść dokumentu albo użyj przycisku PDF poniżej..."
              required
              value={content}
            />
          </div>

          <div className="knowledge-pdf-upload">
            <input
              accept="application/pdf,.pdf"
              className="sr-only"
              disabled={isLoading || isPdfLoading}
              onChange={handlePdfUpload}
              ref={pdfInputRef}
              type="file"
            />
            <button
              disabled={isLoading || isPdfLoading}
              onClick={() => pdfInputRef.current?.click()}
              type="button"
            >
              {isPdfLoading ? "Czytam PDF…" : "📎 Dodaj PDF do bazy wiedzy"}
            </button>
            <span>
              PDF zostanie najpierw zamieniony na tekst, żeby można było go sprawdzić przed zapisem.
            </span>
          </div>

          <div className="knowledge-examples" aria-label="Przykładowe dokumenty SKD">
            <span>Podpowiedzi:</span>
            {examples.map((example) => (
              <button
                disabled={isLoading}
                key={example.label}
                onClick={() => {
                  setTitle(example.title);
                  setContent(example.content);
                }}
                type="button"
              >
                {example.label}
              </button>
            ))}
          </div>

          <div className="knowledge-actions">
            <button
              className="knowledge-submit"
              disabled={isLoading || !title.trim() || !content.trim()}
              type="submit"
            >
              {isLoading ? "Przetwarzam…" : "📤 Zapisz w bazie wiedzy"}
            </button>

            {isLoading ? (
              <div className="knowledge-progress" aria-live="polite">
                <div
                  aria-valuemax={progress.total || 1}
                  aria-valuemin={0}
                  aria-valuenow={progress.current}
                  className="knowledge-progress-track"
                  role="progressbar"
                >
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <p>
                  Przetwarzam fragment {progress.current} z {progress.total || "…"}
                </p>
              </div>
            ) : null}
          </div>

          {notice ? (
            <p className={`knowledge-notice ${notice.kind}`} role="status">
              {notice.text}
            </p>
          ) : null}
        </form>

        <aside className="knowledge-side">
          <section className="knowledge-card knowledge-search">
            <header>
              <div>
                <p className="eyebrow">Test RAG</p>
                <h2>Wyszukaj w bazie</h2>
              </div>
              <span>{totalFragments} fragmentów</span>
            </header>
            <p>Sprawdź trafność fragmentów przed rozmową z agentem.</p>
            <form onSubmit={searchKnowledge}>
              <label className="sr-only" htmlFor="knowledge-search-query">
                Szukaj w bazie wiedzy
              </label>
              <input
                id="knowledge-search-query"
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setHasSearched(false);
                }}
                placeholder="Np. termin SKD, RRSO, prowizja..."
                value={searchQuery}
              />
              <button disabled={isSearching || !searchQuery.trim()} type="submit">
                {isSearching ? "Szukam…" : "Szukaj"}
              </button>
            </form>

            {searchResults.length > 0 ? (
              <ul className="knowledge-search-results">
                {searchResults.map((result, index) => (
                  <li key={`${result.title}-${index}`}>
                    <div>
                      <strong>{result.title}</strong>
                      <span>{result.content}</span>
                    </div>
                    <em>{Math.round(result.similarity * 100)}%</em>
                  </li>
                ))}
              </ul>
            ) : hasSearched && !isSearching ? (
              <p className="knowledge-empty knowledge-search-empty">
                Brak pasujących fragmentów dla tego pytania.
              </p>
            ) : null}
          </section>

          <section className="knowledge-card knowledge-documents">
            <header>
              <div>
                <h2>Twoja baza wiedzy</h2>
                <p>{totalFragments} fragmentów z {documents.length} dokumentów</p>
              </div>
              <span>{documents.length}</span>
            </header>

            {isListLoading ? (
              <p className="knowledge-empty">Pobieram dokumenty…</p>
            ) : documents.length ? (
              <ul>
                {documents.map((document) => (
                  <li key={document.title}>
                    <div className="knowledge-document-main">
                      <button
                        aria-expanded={selectedDocumentTitle === document.title}
                        className="knowledge-document-title"
                        onClick={() => void selectDocument(document.title)}
                        type="button"
                      >
                        {document.title}
                      </button>
                      <span>
                        {document.chunks} {document.chunks === 1 ? "fragment" : "fragmentów"} ·{" "}
                        {new Intl.DateTimeFormat("pl-PL", {
                          dateStyle: "medium",
                        }).format(new Date(document.created_at))}
                      </span>
                    </div>
                    <button
                      aria-label={`Usuń dokument ${document.title}`}
                      onClick={() => void deleteDocument(document.title)}
                      title="Usuń"
                      type="button"
                    >
                      🗑️
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="knowledge-empty">
                <strong>Jeszcze tu cicho.</strong>
                Dodaj pierwszy dokument SKD, aby agent miał własne źródła.
              </p>
            )}

            {selectedDocumentTitle ? (
              <section className="knowledge-fragments" aria-live="polite">
                <h3>Fragmenty: {selectedDocumentTitle}</h3>
                {isFragmentsLoading ? (
                  <p>Wczytuję fragmenty…</p>
                ) : (
                  <ol>
                    {fragments.map((fragment, index) => (
                      <li key={`${fragment.created_at}-${index}`}>
                        <span>Fragment {index + 1}</span>
                        <p>{fragment.content}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ) : null}
          </section>

          <div className="knowledge-tip">
            <strong>Jak przygotować tekst?</strong>
            Najlepiej dodawaj materiały źródłowe: checklisty SKD, wzory pism,
            fragmenty ustawy, FAQ klienta i procedury analizy umowy.
          </div>
        </aside>
      </section>
    </main>
  );
}
