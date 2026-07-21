"use client";

import { FormEvent, useState } from "react";
import { ModelSelector } from "../components/ModelSelector";
import { TopNavigation } from "../components/TopNavigation";
import { getAiModelDetails, type AiModel } from "../lib/models";

const sampleImagePrompts = [
  "Minimalistyczne logo kawiarni w stylu japońskim",
  "Post na Instagram: kawa latte art, ciepłe światło, widok z góry",
  "Kreacja reklamowa: wyprzedaż letnia -50%, nowoczesny design",
  "Ikona aplikacji: robot AI, gradient fioletowo-niebieski, flat design",
  "Infografika: 5 kroków do produktywności, pastelowe kolory",
  "Zdjęcie produktowe: elegancki zegarek na ciemnym tle",
] as const;

type GenerateImageResponse = {
  error?: string;
  image?: string;
  model?: AiModel;
  text?: string;
};

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const [aiModel, setAiModel] = useState<AiModel>("lite");
  const [lastModel, setLastModel] = useState<AiModel>("lite");
  const [image, setImage] = useState("");
  const [modelText, setModelText] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const canGenerate = prompt.trim().length > 0 && !isLoading;
  const canRegenerate = lastPrompt.trim().length > 0 && !isLoading;

  async function generateImage(nextPrompt: string, nextModel: AiModel = aiModel) {
    const trimmedPrompt = nextPrompt.trim();
    if (!trimmedPrompt || isLoading) {
      return;
    }

    const selectedModel = nextModel;

    setIsLoading(true);
    setError("");
    setImage("");
    setModelText("");
    setLastPrompt(trimmedPrompt);
    setLastModel(selectedModel);

    try {
      const response = await fetch("/api/generate-image", {
        body: JSON.stringify({ model: selectedModel, prompt: trimmedPrompt }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json()) as GenerateImageResponse;

      if (!response.ok || !data.image) {
        throw new Error(data.error ?? "Nie udało się wygenerować obrazu.");
      }

      setImage(data.image);
      setLastModel(data.model ?? selectedModel);
      setModelText(data.text ?? "");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Nie udało się wygenerować obrazu.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void generateImage(prompt);
  }

  function handleSamplePrompt(nextPrompt: string) {
    setPrompt(nextPrompt);
    setError("");
  }

  function handleDownload() {
    if (!image) {
      return;
    }

    const link = document.createElement("a");
    link.href = image;
    link.download = "ai-generated.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handleRegenerate() {
    void generateImage(lastPrompt || prompt, lastModel);
  }

  return (
    <main className="chat-shell think-shell generate-shell">
      <TopNavigation className="think-nav" />

      <section className="chat-panel think-panel generate-panel" aria-label="Generator grafik AI">
        <header className="chat-header">
          <div className="agent-lockup">
            <div className="brand-mark generate" aria-hidden="true">
              🎨
            </div>
            <div>
              <p className="eyebrow">Gemini Image</p>
              <h1>🎨 Generator grafik AI</h1>
              <p className="agent-description">
                Opisz co chcesz - AI stworzy obraz w kilka sekund.
              </p>
            </div>
          </div>
          <div className="status-pill">
            <span className="status-dot" aria-hidden="true" />
            Gotowa
          </div>
        </header>

        <section className="generate-workspace">
          <form className="generate-form" onSubmit={handleSubmit}>
            <label className="generate-label" htmlFor="image-prompt">
              Prompt
            </label>
            <textarea
              disabled={isLoading}
              id="image-prompt"
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Opisz obraz, który chcesz wygenerować..."
              value={prompt}
            />

            <ModelSelector disabled={isLoading} onChange={setAiModel} value={aiModel} />

            <div className="sample-questions generate-prompts" aria-label="Przykładowe prompty">
              {sampleImagePrompts.map((samplePrompt) => (
                <button
                  disabled={isLoading}
                  key={samplePrompt}
                  onClick={() => handleSamplePrompt(samplePrompt)}
                  type="button"
                >
                  {samplePrompt}
                </button>
              ))}
            </div>

            <button className="generate-submit" disabled={!canGenerate} type="submit">
              🎨 Generuj
            </button>
          </form>

          <section className="generate-result" aria-live="polite">
            {isLoading ? (
              <div className="image-loading">
                <div className="message-badges">
                  <span className={`model-badge ${lastModel}`}>
                    {getAiModelDetails(lastModel).badge}
                  </span>
                </div>
                <span>Generuję... (5-15 sekund)</span>
              </div>
            ) : image ? (
              <div className="image-result">
                <img alt={lastPrompt || "Wygenerowany obraz AI"} src={image} />
                {modelText && <p>{modelText}</p>}
                <div className="message-badges">
                  <span className={`model-badge ${lastModel}`}>
                    {getAiModelDetails(lastModel).badge}
                  </span>
                </div>
                <div className="image-actions">
                  <button onClick={handleDownload} type="button">
                    💾 Pobierz
                  </button>
                  <button disabled={!canRegenerate} onClick={handleRegenerate} type="button">
                    🔄 Ponownie
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state generate-empty">
                <p>Wybierz przykład albo wpisz własny opis obrazu.</p>
              </div>
            )}

            {error && (
              <div className="message error generate-error">
                <p>{error}</p>
              </div>
            )}
          </section>
        </section>
      </section>
    </main>
  );
}


