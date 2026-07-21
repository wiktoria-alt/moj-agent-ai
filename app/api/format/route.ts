import { google } from "@ai-sdk/google";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getModelErrorMessage } from "../../lib/errors";
import { getAiModel, googleModelIds, type AiModel } from "../../lib/models";

export const maxDuration = 60;

const formatSystemPrompt = `Jesteś asystentem, który formatuje odpowiedzi według instrukcji użytkownika.

Rozpoznajesz komendy formatu na początku wiadomości:

/tabela [temat] - odpowiedz w formie tabeli markdown
  Kolumny dobierz do tematu. Minimum 3 kolumny, 5 wierszy.
  Przykład: /tabela porównanie frameworków JavaScript

/lista [temat] - odpowiedz jako lista numerowana z opisami
  Każdy punkt: numer + nagłówek (bold) + 1 zdanie opisu.
  Przykład: /lista 10 zasad dobrego kodu

/porownanie [A] vs [B] - tabela porównawcza dwóch rzeczy
  Kolumny: Aspekt | [A] | [B] | Werdykt
  Minimum 6 aspektów + wiersz podsumowania.
  Przykład: /porownanie React vs Vue

/faq [temat] - lista pytań i odpowiedzi
  Format: **Q:** pytanie → **A:** odpowiedź
  Minimum 5 par Q&A.
  Przykład: /faq praca zdalna

/email [opis] - napisz profesjonalny email
  Format: Temat | Od/Do | Treść | Podpis
  Przykład: /email prośba o urlop na 2 tygodnie

Jeśli wiadomość NIE zaczyna się od komendy - odpowiadaj normalnie, ale w czystym, czytelnym markdown.

ZAWSZE formatuj w markdown: nagłówki, pogrubienia, tabele i listy.
Odpowiadaj po polsku. Nie dodawaj wstępu typu "Oto odpowiedź", tylko od razu właściwy format.`;

export async function POST(req: Request) {
  const { messages, model }: { messages: UIMessage[]; model?: unknown } =
    await req.json();
  const selectedModel: AiModel = getAiModel(model);

  const result = streamText({
    model: google(googleModelIds[selectedModel]),
    maxRetries: 0,
    maxOutputTokens: selectedModel === "pro" ? 2200 : 1400,
    temperature: 0.2,
    system: formatSystemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => getModelErrorMessage(error, selectedModel),
  });
}
