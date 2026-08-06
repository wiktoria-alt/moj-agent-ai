"use client";

import { FormEvent, useMemo, useState } from "react";
import { TopNavigation } from "../components/TopNavigation";

const languages = [
  { code: "auto", label: "Wykryj automatycznie" },
  { code: "pl", label: "Polski" },
  { code: "en", label: "Angielski" },
  { code: "de", label: "Niemiecki" },
  { code: "fr", label: "Francuski" },
  { code: "es", label: "Hiszpański" },
  { code: "it", label: "Włoski" },
  { code: "uk", label: "Ukraiński" },
  { code: "ru", label: "Rosyjski" },
] as const;

type LanguageCode = (typeof languages)[number]["code"];

export default function GoogleTranslatePage() {
  const [source, setSource] = useState<LanguageCode>("auto");
  const [target, setTarget] = useState<LanguageCode>("pl");
  const [text, setText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const charactersCount = useMemo(() => text.trim().length, [text]);
  const canTranslate = charactersCount > 0 && !isLoading;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canTranslate) return;

    setIsLoading(true);
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/google-translate", {
        body: JSON.stringify({ source, target, text }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        translatedText?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "Nie udało się przetłumaczyć tekstu.");
      }

      setTranslatedText(data.translatedText ?? "");
    } catch (translationError) {
      setError(
        translationError instanceof Error
          ? translationError.message
          : "Nie udało się przetłumaczyć tekstu.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function swapLanguages() {
    if (source === "auto") {
      setSource(target);
      setTarget("en");
      return;
    }

    setSource(target);
    setTarget(source);
    setText(translatedText || text);
    setTranslatedText(text);
  }

  async function copyTranslation() {
    if (!translatedText) return;

    await navigator.clipboard.writeText(translatedText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <main className="chat-shell translator-shell">
      <TopNavigation />

      <section className="chat-panel translator-panel" aria-label="Tłumacz Google">
        <header className="chat-header">
          <div className="agent-lockup">
            <div className="brand-mark translate" aria-hidden="true">
              🌍
            </div>
            <div>
              <p className="eyebrow">Tłumaczenia</p>
              <h1>Tłumacz Google</h1>
              <p className="agent-description">
                Szybko tłumacz teksty, maile, fragmenty umów i wiadomości.
              </p>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Gotowa
          </div>
        </header>

        <form className="translator-card" onSubmit={handleSubmit}>
          <div className="translator-controls">
            <label>
              Z języka
              <select
                disabled={isLoading}
                onChange={(event) => setSource(event.target.value as LanguageCode)}
                value={source}
              >
                {languages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              aria-label="Zamień języki"
              disabled={isLoading}
              onClick={swapLanguages}
              type="button"
            >
              ⇄
            </button>

            <label>
              Na język
              <select
                disabled={isLoading}
                onChange={(event) => setTarget(event.target.value as LanguageCode)}
                value={target}
              >
                {languages
                  .filter((language) => language.code !== "auto")
                  .map((language) => (
                    <option key={language.code} value={language.code}>
                      {language.label}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <div className="translator-grid">
            <label>
              Tekst do tłumaczenia
              <textarea
                disabled={isLoading}
                onChange={(event) => setText(event.target.value)}
                placeholder="Wklej tekst do przetłumaczenia..."
                value={text}
              />
            </label>

            <label>
              Tłumaczenie
              <textarea
                readOnly
                placeholder="Tutaj pojawi się tłumaczenie..."
                value={isLoading ? "Tłumaczę..." : translatedText}
              />
            </label>
          </div>

          {error ? (
            <p className="translator-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="translator-actions">
            <button disabled={!canTranslate} type="submit">
              {isLoading ? "Tłumaczę..." : "🌍 Przetłumacz"}
            </button>
            <button
              disabled={!translatedText || isLoading}
              onClick={() => void copyTranslation()}
              type="button"
            >
              {copied ? "Skopiowano!" : "Kopiuj wynik"}
            </button>
            <span>{charactersCount}/8000 znaków</span>
          </div>
        </form>
      </section>
    </main>
  );
}
