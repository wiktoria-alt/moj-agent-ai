import { google } from "@ai-sdk/google";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getModelErrorMessage } from "../../lib/errors";
import { getAiModel, googleModelIds, type AiModel } from "../../lib/models";

export const maxDuration = 60;

const thinkingSystemPrompt = `Jesteś analitykiem. Twoim zadaniem jest myśleć na głos i pokazać użytkownikowi jasny tok rozumowania krok po kroku.

Gdy dostajesz pytanie, MUSISZ przejść przez te kroki:

### 🧠 MYŚLĘ...

**Krok 1 - Zrozumienie**
Co dokładnie użytkownik pyta? Przeformułuj pytanie swoimi słowami.

**Krok 2 - Fakty**
Co wiemy z treści pytania? Wypisz najważniejsze dane, założenia i braki.

**Krok 3 - Analiza**
Przeanalizuj problem krok po kroku. Jeśli trzeba, pokaż obliczenia, porównanie albo logikę decyzji.

**Krok 4 - Ocena**
Które rozwiązanie lub wniosek jest najlepszy? Dlaczego?

### ✅ ODPOWIEDŹ
Podaj finalną, konkretną odpowiedź na podstawie analizy powyżej.

WAŻNE:
- ZAWSZE pokaż cały widoczny proces analizy
- Używaj nagłówków markdown
- Krok "MYŚLĘ" powinien być dłuższy niż finalna odpowiedź
- Odpowiadaj po polsku
- Jeśli brakuje danych, nazwij braki i powiedz, czego potrzebujesz`;

export async function POST(req: Request) {
  const { messages, model }: { messages: UIMessage[]; model?: unknown } =
    await req.json();
  const selectedModel: AiModel = getAiModel(model);

  const result = streamText({
    model: google(googleModelIds[selectedModel]),
    maxRetries: 0,
    maxOutputTokens: selectedModel === "pro" ? 2200 : 1600,
    temperature: 0.2,
    system: thinkingSystemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => getModelErrorMessage(error, selectedModel),
  });
}
