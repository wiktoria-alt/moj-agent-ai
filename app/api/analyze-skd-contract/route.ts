import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { getModelErrorMessage } from "../../lib/errors";
import { searchKnowledgeBase } from "../../lib/knowledgeSearch";
import { googleModelIds } from "../../lib/models";

export const maxDuration = 60;

const maxContractLength = 90000;
const maxKnowledgeLength = 24000;

function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  try {
    if (!process.env.GOOGLE_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return Response.json(
        { error: "Brakuje klucza Google API potrzebnego do analizy umowy." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      bank?: unknown;
      contractText?: unknown;
      product?: unknown;
    };
    const contractText = textValue(body.contractText, maxContractLength);
    const bank = textValue(body.bank, 120) || "nie podano";
    const product = textValue(body.product, 120) || "kredyt konsumencki";

    if (contractText.length < 100) {
      return Response.json(
        { error: "Nie udało się odczytać wystarczającej ilości tekstu z umowy." },
        { status: 400 },
      );
    }

    let knowledge;

    try {
      knowledge = await searchKnowledgeBase(
        "Ustawa o kredycie konsumenckim art. 30 ust. 1 pkt obowiązki informacyjne umowy oraz art. 45 sankcja kredytu darmowego",
      );
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Nie udało się odczytać ustawy z bazy wiedzy.",
        },
        { status: 502 },
      );
    }

    if (!knowledge.results.length) {
      return Response.json(
        {
          error:
            "Nie znalazłem art. 30 ustawy w bazie wiedzy. Najpierw dodaj ustawę o kredycie konsumenckim w zakładce Baza wiedzy.",
        },
        { status: 422 },
      );
    }

    const knowledgeText = knowledge.results
      .map(
        (result, index) =>
          `ŹRÓDŁO ${index + 1}: ${result.title}\n${result.content}`,
      )
      .join("\n\n")
      .slice(0, maxKnowledgeLength);

    const result = await generateText({
      maxOutputTokens: 4200,
      maxRetries: 0,
      model: google(googleModelIds.flash),
      prompt: `Jesteś analitykiem umów kredytu konsumenckiego. Wykonaj ostrożną, wstępną analizę umowy pod kątem obowiązków informacyjnych z art. 30 ustawy o kredycie konsumenckim i możliwego znaczenia dla art. 45 (sankcja kredytu darmowego).

WAŻNE ZASADY:
- Podstawą prawną są WYŁĄCZNIE fragmenty z BAZY WIEDZY poniżej.
- Nie wymyślaj numerów punktów ani treści przepisów. Numer art. 30 ust. 1 pkt podaj tylko wtedy, gdy wynika ze źródła.
- Brak informacji w odczytanym tekście oznacz jako "nie znaleziono w odczytanym tekście", a nie jako pewne naruszenie.
- Odróżniaj: "brak", "możliwa niezgodność", "zgodne" i "do ręcznej weryfikacji".
- Zacytuj krótki fragment umowy przy każdym ustaleniu.
- Nie przesądzaj, że klientowi przysługuje SKD i nie udzielaj ostatecznej porady prawnej.
- Nie wypisuj ani nie odtwarzaj danych osobowych.

Zwróć po polsku raport w Markdown w tej strukturze:
## Wstępny wynik
2-4 zdania podsumowania.

## Weryfikacja art. 30
Tabela: Przepis/punkt | Wymóg z bazy wiedzy | Co znaleziono w umowie | Ocena

## Najważniejsze możliwe naruszenia
Numerowana lista. Przy każdym: podstawa, fragment umowy, dlaczego wymaga dalszego sprawdzenia.

## Czego nie można potwierdzić
Lista braków lub elementów nieczytelnych.

## Następne kroki
Krótka praktyczna checklista dokumentów i kontroli przez prawnika/specjalistę.

KONTEKST SPRAWY:
Bank: ${bank}
Produkt: ${product}

BAZA WIEDZY:
${knowledgeText}

ODCZYTANY I ZANONIMIZOWANY TEKST UMOWY:
${contractText}`,
      temperature: 0.1,
      timeout: { totalMs: 55000 },
    });

    return Response.json({
      analysis: result.text.trim(),
      sources: knowledge.source_documents,
    });
  } catch (error) {
    return Response.json(
      { error: getModelErrorMessage(error, "flash") },
      { status: 500 },
    );
  }
}
