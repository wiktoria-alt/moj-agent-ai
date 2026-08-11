import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { getModelErrorMessage } from "../../lib/errors";
import {
  getKnowledgeDocumentsByTitle,
  searchKnowledgeBase,
} from "../../lib/knowledgeSearch";
import { googleModelIds } from "../../lib/models";

export const maxDuration = 60;

const maxContractLength = 90000;
const maxKnowledgeLength = 60000;

const art30KnowledgeQueries = [
  "Ustawa o kredycie konsumenckim art. 30 pełna treść wszystkie punkty obowiązki informacyjne umowy",
  "art. 30 ust. 1 pkt 1 2 3 4 5 6 7 ustawy o kredycie konsumenckim",
  "art. 30 ust. 1 pkt 8 9 10 11 12 13 ustawy o kredycie konsumenckim",
  "art. 30 ust. 1 pkt 14 15 16 17 18 19 ustawy o kredycie konsumenckim",
  "art. 45 sankcja kredytu darmowego naruszenie art. 30 ustawy o kredycie konsumenckim",
];

function articleWindow(text: string, article: number, nextArticle: number) {
  const start = text.search(new RegExp(`\\bArt\\.?\\s*${article}\\b`, "i"));

  if (start < 0) return "";

  const rest = text.slice(start);
  const next = rest.search(new RegExp(`\\bArt\\.?\\s*${nextArticle}\\b`, "i"));
  return (next > 0 ? rest.slice(0, next) : rest).trim();
}

function articleChecklist(articleText: string) {
  const normalized = articleText
    .replace(/\r/g, "\n")
    .replace(/;\s*(\d{1,2})\)/g, ";\n$1)")
    .replace(/\.\s*(\d{1,2})\)/g, ".\n$1)")
    .replace(/\n{3,}/g, "\n\n");
  const matches = [...normalized.matchAll(/(?:^|\n)\s*(\d{1,2})\)\s*([\s\S]*?)(?=\n\s*\d{1,2}\)|$)/g)];

  if (!matches.length) {
    return normalized.slice(0, 20000);
  }

  return matches
    .map((match) => {
      const point = match[1];
      const requirement = match[2].replace(/\s+/g, " ").trim().slice(0, 900);
      return `Art. 30 ust. 1 pkt ${point}: ${requirement}`;
    })
    .join("\n");
}

function compactText(value: string) {
  return value.replace(/\r/g, "\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function textValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function clientCardPrompt(
  analysis: string,
  bank: string,
  product: string,
  calculationSummary: string,
) {
  return `Przygotuj po polsku prostą fiszkę dla klienta na podstawie raportu SKD i kalkulacji.

Zasady:
- Nie dodawaj nowych naruszeń ani faktów, których nie ma w raporcie.
- Nie przesądzaj prawa do SKD ani wygranej.
- Nie używaj danych osobowych.
- Pisz prostym językiem, zrozumiałym dla osoby bez wiedzy prawnej.

Struktura Markdown:
## Najważniejsze informacje o sprawie
4-6 krótkich punktów: rodzaj umowy, etap, wynik kalkulacji i najważniejsze ustalenia.

## Możliwe błędy w umowie
Każdy błąd opisz jednym prostym zdaniem i dodaj podstawę z raportu. Element niepewny nazwij "do potwierdzenia".

## Co klient powinien teraz przygotować
Krótka lista dokumentów lub informacji.

## Pytania i odpowiedzi klienta
Przygotuj 6-8 par w formacie:
### Pytanie
Odpowiedź w 2-4 prostych zdaniach.
Uwzględnij: co wykryto, czy SKD jest pewne, co oznacza wynik kalkulatora, jakie dokumenty są potrzebne, co może odpowiedzieć bank i jaki jest kolejny krok.

## Ważne zastrzeżenie
Jedno krótkie zdanie, że to wstępna analiza wymagająca potwierdzenia przez specjalistę.

KRYTYCZNA REGULA:
Raport ma bazowac na sekcji "CHECKLISTA ART. 30 Z DOKUMENTU SYSTEMOWEGO". W tabeli "Weryfikacja art. 30" wypisz kazdy punkt z tej checklisty, porownaj go z odczytanym tekstem umowy i nie zgaduj punktow spoza dokumentu systemowego.

Bank: ${bank}
Produkt: ${product}
Kalkulacja: ${calculationSummary}

RAPORT:
${analysis}`;
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
      calculationSummary?: unknown;
      contractText?: unknown;
      existingAnalysis?: unknown;
      product?: unknown;
    };
    const contractText = textValue(body.contractText, maxContractLength);
    const existingAnalysis = textValue(body.existingAnalysis, 30000);
    const calculationSummary =
      textValue(body.calculationSummary, 2000) || "brak zapisanej kalkulacji";
    const bank = textValue(body.bank, 120) || "nie podano";
    const product = textValue(body.product, 120) || "kredyt konsumencki";

    if (existingAnalysis.length >= 100 && contractText.length < 100) {
      const cardResult = await generateText({
        maxOutputTokens: 2200,
        maxRetries: 0,
        model: google(googleModelIds.flash),
        prompt: clientCardPrompt(
          existingAnalysis,
          bank,
          product,
          calculationSummary,
        ),
        temperature: 0.15,
        timeout: { totalMs: 45000 },
      });

      return Response.json({ clientCard: cardResult.text.trim() });
    }

    if (contractText.length < 100) {
      return Response.json(
        { error: "Nie udało się odczytać wystarczającej ilości tekstu z umowy." },
        { status: 400 },
      );
    }

    let knowledgeResults: Awaited<ReturnType<typeof searchKnowledgeBase>>["results"] = [];
    let sourceDocuments: string[] = [];
    let article30PointChecklist = "";

    try {
      const [documentKnowledge, ...knowledgeResponses] = await Promise.all([
        getKnowledgeDocumentsByTitle([
          "%Ustawa z 12.05.2011 o kredycie konsumenckim%",
          "%art. 30%",
          "%art 30%",
          "%kredycie konsumenckim%",
          "%kredytu konsumenckiego%",
          "%Ustawa z 12.05.2011%",
        ], 500),
        ...art30KnowledgeQueries.map((query) =>
          searchKnowledgeBase(query, { matchCount: 12, matchThreshold: 0.2 }),
        ),
      ]);
      const fullLawText = compactText(
        documentKnowledge.results.map((result) => result.content).join("\n\n"),
      );
      const article30Text = articleWindow(fullLawText, 30, 31);
      const article45Text = articleWindow(fullLawText, 45, 46);
      article30PointChecklist = articleChecklist(article30Text);

      if (!article30Text) {
        return Response.json(
          {
            error:
              "Nie znalazłem art. 30 ustawy w dokumencie systemowym. Dodaj w Bazie wiedzy ustawę o kredycie konsumenckim albo sprawdź, czy dokument ma tytuł zawierający 'Ustawa' i 'kredycie konsumenckim'.",
          },
          { status: 422 },
        );
      }
      const exactLawResults = [
        article30Text
          ? {
              added_at: documentKnowledge.results[0]?.added_at ?? null,
              content: article30Text,
              metadata: { source: "art. 30", priority: "exact" },
              similarity: 2,
              title: "Ustawa o kredycie konsumenckim - art. 30",
            }
          : null,
        article45Text
          ? {
              added_at: documentKnowledge.results[0]?.added_at ?? null,
              content: article45Text,
              metadata: { source: "art. 45", priority: "exact" },
              similarity: 2,
              title: "Ustawa o kredycie konsumenckim - art. 45",
            }
          : null,
      ].filter((result): result is NonNullable<typeof result> => result !== null);

      const allKnowledgeResponses = [
        {
          results: [
            {
              added_at: documentKnowledge.results[0]?.added_at ?? null,
              content: article30PointChecklist,
              metadata: { source: "art. 30 checklist", priority: "checklist" },
              similarity: 3,
              title: "Ustawa o kredycie konsumenckim - checklista art. 30",
            },
            ...exactLawResults,
          ],
          source_documents: [
            ...documentKnowledge.source_documents,
            ...exactLawResults.map((result) => result.title),
          ],
          total_found: exactLawResults.length,
        },
        ...knowledgeResponses,
      ];

      const seen = new Set<string>();

      for (const response of allKnowledgeResponses) {
        sourceDocuments = [...sourceDocuments, ...response.source_documents];

        for (const result of response.results) {
          const key = `${result.title}\n${result.content}`;
          if (seen.has(key)) continue;
          seen.add(key);
          knowledgeResults.push(result);
        }
      }

      knowledgeResults = knowledgeResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 30);
      sourceDocuments = [...new Set(sourceDocuments)];
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

    if (!knowledgeResults.length) {
      return Response.json(
        {
          error:
            "Nie znalazłem art. 30 ustawy w bazie wiedzy. Najpierw dodaj ustawę o kredycie konsumenckim w zakładce Baza wiedzy.",
        },
        { status: 422 },
      );
    }

    const knowledgeText = knowledgeResults
      .map(
        (result, index) =>
          `ŹRÓDŁO ${index + 1}: ${result.title}\n${result.content}`,
      )
      .join("\n\n")
      .slice(0, maxKnowledgeLength);

    const result = await generateText({
      maxOutputTokens: 6000,
      maxRetries: 0,
      model: google(googleModelIds.flash),
        prompt: `Jesteś analitykiem umów kredytu konsumenckiego. Wykonaj ostrożną, wstępną analizę umowy pod kątem obowiązków informacyjnych z art. 30 ustawy o kredycie konsumenckim i możliwego znaczenia dla art. 45 (sankcja kredytu darmowego).

WAŻNE ZASADY:
- Najpierw zapoznaj się z BAZĄ WIEDZY poniżej i wyodrębnij z niej pełną listę punktów art. 30 ust. 1, które są widoczne w źródłach.
- Podstawą prawną są WYŁĄCZNIE fragmenty z BAZY WIEDZY poniżej.
- Nie wymyślaj numerów punktów ani treści przepisów. Numer art. 30 ust. 1 pkt podaj tylko wtedy, gdy wynika ze źródła.
- W sekcji "Weryfikacja art. 30" wypisz KAŻDY punkt art. 30 ust. 1 znaleziony w bazie wiedzy. Nie pomijaj punktu tylko dlatego, że nie widzisz go w umowie.
- Dla każdego punktu porównaj wymóg ustawy z odczytanym tekstem umowy.
- Ocena musi być jedną z wartości: "naruszone", "możliwe naruszenie", "OK", "do ręcznej weryfikacji", "nie znaleziono w odczytanym tekście".
- "Naruszone" wpisz tylko wtedy, gdy w umowie jest zapis sprzeczny z wymogiem albo brak wymogu jest wyraźnie widoczny po przeszukaniu tekstu.
- Brak informacji w odczytanym tekście oznacz jako "nie znaleziono w odczytanym tekście" albo "do ręcznej weryfikacji", a nie jako pewne naruszenie.
- Przy każdym punkcie podaj krótki cytat z ustawy z bazy wiedzy i krótki cytat z umowy. Jeśli cytatu z umowy nie ma, napisz "nie znaleziono".
- W kolumnie "Dlaczego" wyjaśnij jednym konkretnym zdaniem, na czym polega zgodność, brak albo możliwe naruszenie.
- Nie przesądzaj, że klientowi przysługuje SKD i nie udzielaj ostatecznej porady prawnej.
- Nie wypisuj ani nie odtwarzaj danych osobowych.

Zwróć po polsku raport w Markdown w tej strukturze:
## Wstępny wynik
2-4 zdania podsumowania.

## Weryfikacja art. 30
Tabela: Przepis/punkt | Wymóg z ustawy | Cytat z umowy / brak | Ocena | Dlaczego

## Punkty naruszone albo do ręcznej weryfikacji
Numerowana lista tylko tych punktów, które mają ocenę "naruszone", "możliwe naruszenie", "do ręcznej weryfikacji" albo "nie znaleziono w odczytanym tekście". Przy każdym wpisz: podstawa, wymóg ustawy, ustalenie z umowy, dlaczego to ma znaczenie dla SKD.

## Czego nie można potwierdzić
Lista braków lub elementów nieczytelnych.

## Następne kroki
Krótka praktyczna checklista dokumentów i kontroli przez prawnika/specjalistę.

Następnie wpisz dokładnie znacznik [[FISZKA_KLIENTA]] i przygotuj fiszkę według tych samych zasad oraz struktury co w instrukcji poniżej:
${clientCardPrompt("Użyj ustaleń z raportu utworzonego powyżej.", bank, product, calculationSummary)}

KONTEKST SPRAWY:
Bank: ${bank}
Produkt: ${product}
Kalkulacja: ${calculationSummary}

BAZA WIEDZY:
${knowledgeText}

CHECKLISTA ART. 30 Z DOKUMENTU SYSTEMOWEGO:
${article30PointChecklist}

ODCZYTANY I ZANONIMIZOWANY TEKST UMOWY:
${contractText}`,
      temperature: 0.1,
      timeout: { totalMs: 55000 },
    });

    const [analysisPart, cardPart] = result.text.split("[[FISZKA_KLIENTA]]");

    return Response.json({
      analysis: analysisPart.trim(),
      clientCard: cardPart?.trim() ?? "",
      sources: sourceDocuments,
    });
  } catch (error) {
    return Response.json(
      { error: getModelErrorMessage(error, "flash") },
      { status: 500 },
    );
  }
}
