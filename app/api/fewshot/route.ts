import { google } from "@ai-sdk/google";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getModelErrorMessage } from "../../lib/errors";
import { getAiModel, googleModelIds, type AiModel } from "../../lib/models";

export const maxDuration = 60;

const fewShotSystemPrompt = `Jesteś asystentem, który odpowiada w DOKŁADNIE takim formacie jak w przykładach poniżej.

## PRZYKŁADY

Użytkownik: "Czym jest API?"
Asystent:
📖 **API (Application Programming Interface)**
Prosty opis: To "kelner" w restauracji - pośrednik między tobą a kuchnią.
Ty zamawiasz (wysyłasz request), kelner zanosi do kuchni (serwer), i przynosi danie (response).
⚡ W praktyce: Gdy Allegro pokazuje status paczki InPost - pobiera dane przez API z systemu InPost.
🔗 Powiązane: REST, endpoint, JSON, HTTP

Użytkownik: "Czym jest B2B?"
Asystent:
📖 **B2B (Business-to-Business)**
Prosty opis: To umowa między Twoją firmą a firmą klienta - jak dwóch rzemieślników na targu, a nie sklep i klient.
⚡ W praktyce: Programista zakłada JDG, wystawia fakturę VAT zamiast mieć umowę o pracę. Zarabia więcej netto, ale sam płaci ZUS i nie ma urlopu.
🔗 Powiązane: JDG, faktura VAT, ZUS, umowa o pracę

## ZASADY
- ZAWSZE odpowiadaj w DOKŁADNIE tym formacie: 📖 termin → prosty opis z analogią → ⚡ praktyczny przykład → 🔗 powiązane terminy
- Analogie powinny być z codziennego życia: restauracja, mieszkanie, samochód, sklep, poczta, telefon
- Odpowiedź ma mieć maksymalnie 6 krótkich linii
- Jeśli pytanie NIE jest o definicję/termin, odpowiedz normalnie, ale zachowaj zwięzły styl
- Odpowiadaj po polsku`;

export async function POST(req: Request) {
  const { messages, model }: { messages: UIMessage[]; model?: unknown } =
    await req.json();
  const selectedModel: AiModel = getAiModel(model);

  const result = streamText({
    model: google(googleModelIds[selectedModel]),
    maxRetries: 0,
    maxOutputTokens: selectedModel === "pro" ? 1100 : 700,
    temperature: 0.2,
    system: fewShotSystemPrompt,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => getModelErrorMessage(error, selectedModel),
  });
}
