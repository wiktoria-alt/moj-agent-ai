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

const focusedSkdChecklist = [
  "1. art. 29 ust. 1 u.k.k. - Brak przekazania umowy na trwałym nośniku; sprawdź transparentność i dowód doręczenia umowy.",
  "2. art. 30 ust. 1 pkt 4 u.k.k. - Niejednoznaczne określenie kwoty kredytu; sprawdź, czy klient może odróżnić kwotę netto od kosztów skredytowanych.",
  "3. art. 30 ust. 1 pkt 5 u.k.k. - Niejasne zasady i terminy wypłaty kredytu; sprawdź, czy da się ustalić termin rzeczywistego otrzymania środków.",
  "4. art. 30 ust. 1 pkt 6 u.k.k. - Nieprecyzyjna klauzula zmiennego oprocentowania; sprawdź, czy bank nie ma dowolności kształtowania kosztu kredytu.",
  "5. art. 30 ust. 1 pkt 6 u.k.k. - Wadliwe kryteria do wyliczenia oprocentowania; sprawdź, czy kryteria są obiektywne, jasne i weryfikowalne.",
  "6. art. 30 ust. 1 pkt 7 u.k.k. - Błędnie obliczone RRSO oraz całkowita kwota do zapłaty; sprawdź, czy koszt kredytu nie jest zawyżony albo niejasny.",
  "7. art. 30 ust. 1 pkt 10 u.k.k. - Brak skonkretyzowanych warunków zmiany kosztów i opłat bankowych.",
  "8. art. 30 ust. 1 pkt 11 u.k.k. - Brak jasnych zasad naliczania i informowania o odsetkach za opóźnienie.",
  "9. art. 30 ust. 1 pkt 14 u.k.k. - Brak wymaganych informacji o ubezpieczeniu oraz sposobie jego sprzedaży.",
  "10. art. 30 ust. 1 pkt 15 u.k.k. - Brak możliwości określenia rzeczywistego rozpoczęcia biegu terminu odstąpienia od umowy.",
  "11. art. 30 ust. 1 pkt 15 u.k.k. - Brak informacji o skutkach odstąpienia od umowy.",
  "12. art. 30 ust. 1 pkt 15 u.k.k. - Ograniczenie formy odstąpienia do formy pisemnej.",
  "13. art. 30 ust. 1 pkt 15 u.k.k. - Brak wskazania dziennych odsetek w kontekście odstąpienia.",
  "14. art. 30 ust. 1 pkt 15 u.k.k. - Zastosowanie konwencji 360 dni w roku przy dziennym koszcie odsetek.",
  "15. art. 30 ust. 1 pkt 15 u.k.k. - Zastosowanie kwoty brutto zamiast netto przy dziennym koszcie odsetek.",
  "16. art. 30 ust. 1 pkt 16 u.k.k. - Brak informacji o terminie rozliczenia umowy wykonanej przed terminem.",
  "17. art. 30 ust. 1 pkt 16 u.k.k. - Niepełna informacja o zasadach wcześniejszej spłaty kredytu.",
  "18. art. 30 ust. 1 pkt 16 u.k.k. - Wymóg pisemnej dyspozycji wcześniejszej spłaty; sprawdź, czy utrudnia korzystanie z prawa do wcześniejszej spłaty.",
  "19. art. 36a u.k.k. - Nieuprawnione podwyższenie pozaodsetkowych kosztów kredytu ponad ustawowy limit.",
];

const legacyFocusedSkdRows = [
  {
    check: "Trwały nośnik: czy umowa została przekazana konsumentowi w formie pozwalającej zachować i odtworzyć treść, oraz czy widać dowód doręczenia.",
    index: 1,
    source: "art. 29 ust. 1 u.k.k.",
  },
  {
    check: "Kwota kredytu: czy kwota kredytu jest jednoznaczna i nie miesza kwoty netto z kosztami skredytowanymi.",
    index: 2,
    source: "art. 30 ust. 1 pkt 4 u.k.k.",
  },
  {
    check: "Zasady i terminy wypłaty: czy da się ustalić, kiedy i w jaki sposób konsument rzeczywiście otrzyma środki.",
    index: 3,
    source: "art. 30 ust. 1 pkt 5 u.k.k.",
  },
  {
    check: "Oprocentowanie: czy klauzula zmiennego oprocentowania jest precyzyjna, a kryteria zmiany oprocentowania są obiektywne, jasne i weryfikowalne.",
    index: 4,
    source: "art. 30 ust. 1 pkt 6 u.k.k.",
  },
  {
    check: "RRSO i całkowita kwota do zapłaty: czy wartości są obliczone i opisane jasno oraz czy nie widać zawyżenia kosztu kredytu.",
    index: 5,
    source: "art. 30 ust. 1 pkt 7 u.k.k.",
  },
  {
    check: "Koszty i opłaty bankowe: czy warunki zmiany kosztów i opłat są skonkretyzowane, a nie pozostawione dowolnej decyzji banku.",
    index: 6,
    source: "art. 30 ust. 1 pkt 10 u.k.k.",
  },
  {
    check: "Odsetki za opóźnienie: czy umowa jasno opisuje zasady naliczania i informowania o odsetkach za opóźnienie.",
    index: 7,
    source: "art. 30 ust. 1 pkt 11 u.k.k.",
  },
  {
    check: "Ubezpieczenie: czy umowa zawiera wymagane informacje o ubezpieczeniu oraz sposobie jego sprzedaży.",
    index: 8,
    source: "art. 30 ust. 1 pkt 14 u.k.k.",
  },
  {
    check: "Odstąpienie od umowy: sprawdź termin rozpoczęcia biegu odstąpienia, skutki odstąpienia, formę odstąpienia, dzienne odsetki, konwencję 360 dni oraz czy dzienny koszt liczono od kwoty brutto zamiast netto.",
    index: 9,
    source: "art. 30 ust. 1 pkt 15 u.k.k.",
  },
  {
    check: "Wcześniejsza spłata: sprawdź termin rozliczenia umowy wykonanej przed terminem, kompletność zasad wcześniejszej spłaty i ewentualny wymóg pisemnej dyspozycji.",
    index: 10,
    source: "art. 30 ust. 1 pkt 16 u.k.k.",
  },
  {
    check: "Limit pozaodsetkowych kosztów kredytu: czy koszty nie przekraczają ustawowego limitu.",
    index: 11,
    source: "art. 36a u.k.k.",
  },
];

const focusedSkdRows = [
  {
    check: "Prowizja lub ubezpieczenie kredytowane: sprawdź, czy prowizja albo ubezpieczenie zostały doliczone do kwoty brutto kredytu i przez to wpływają na RRSO oraz całkowitą kwotę do zapłaty.",
    index: 1,
    source: "art. 30 ust. 1 pkt 7 u.k.k.",
  },
  {
    check: "Koszty i opłaty bankowe: sprawdź, czy umowa konkretnie opisuje warunki zmiany kosztów i opłat bankowych, zamiast zostawiać to uznaniu banku.",
    index: 2,
    source: "art. 30 ust. 1 pkt 10 u.k.k.",
  },
  {
    check: "Odstąpienie od umowy: sprawdź, czy umowa zawiera pełne informacje o prawie odstąpienia, terminie, sposobie, skutkach odstąpienia oraz kwocie odsetek dziennych.",
    index: 3,
    source: "art. 30 ust. 1 pkt 15 u.k.k.",
  },
  {
    check: "Przedterminowa spłata: sprawdź, czy umowa zawiera pełne informacje o prawie do wcześniejszej spłaty, sposobie rozliczenia, terminie zwrotu kosztów i ewentualnych formalnościach.",
    index: 4,
    source: "art. 30 ust. 1 pkt 16 u.k.k.",
  },
];

void focusedSkdChecklist;
void legacyFocusedSkdRows;

function articleWindow(text: string, article: number, nextArticle: number) {
  const start = text.search(new RegExp(`\\bArt\\.?\\s*${article}\\b`, "i"));

  if (start < 0) return "";

  const rest = text.slice(start);
  const next = rest.search(new RegExp(`\\bArt\\.?\\s*${nextArticle}\\b`, "i"));
  return (next > 0 ? rest.slice(0, next) : rest).trim();
}

function articleWindowByPattern(text: string, startPattern: string, nextPattern: string) {
  const start = text.search(new RegExp(startPattern, "i"));

  if (start < 0) return "";

  const rest = text.slice(start);
  const next = rest.search(new RegExp(nextPattern, "i"));
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

function tableCell(value: unknown, fallback = "nie znaleziono") {
  const text = typeof value === "string" ? value : fallback;
  return text
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim()
    .slice(0, 700) || fallback;
}

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function excerptForKeywords(text: string, keywords: string[]) {
  const normalizedText = normalizeForSearch(text);
  const normalizedKeywords = keywords.map(normalizeForSearch);
  const positions = normalizedKeywords
    .map((keyword) => normalizedText.indexOf(keyword))
    .filter((position) => position >= 0);

  if (!positions.length) return "";

  const position = Math.min(...positions);
  const start = Math.max(0, position - 220);
  const end = Math.min(text.length, position + 520);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function fallbackRowsFromContract(contractText: string) {
  const keywordGroups: Record<string, string[]> = {
    "art. 30 ust. 1 pkt 7 u.k.k.": [
      "prowizja",
      "ubezpieczenie",
      "rrso",
      "całkowita kwota do zapłaty",
      "calkowita kwota do zaplaty",
      "kwota kredytu",
      "kredytowana",
      "finansowana",
    ],
    "art. 30 ust. 1 pkt 10 u.k.k.": [
      "opłata",
      "oplata",
      "opłat",
      "koszt",
      "taryfa",
      "tabela opłat",
      "zmiana opłat",
      "może ulec zmianie",
      "bank ma prawo",
    ],
    "art. 30 ust. 1 pkt 15 u.k.k.": [
      "odstąpienie",
      "odstapienie",
      "odstąpić",
      "odstapic",
      "14 dni",
      "odsetki dzienne",
      "formularz odstąpienia",
    ],
    "art. 30 ust. 1 pkt 16 u.k.k.": [
      "wcześniejsza spłata",
      "wczesniejsza splata",
      "przedterminowa spłata",
      "przedterminowa splata",
      "spłata przed terminem",
      "zwrot kosztów",
      "rozliczenie",
      "rekompensata",
    ],
  };

  return focusedSkdRows.map((row) => {
    const quote = excerptForKeywords(contractText, keywordGroups[row.source] ?? []);
    return {
      check: row.check,
      quote: quote || "nie znaleziono",
      reason: quote
        ? "Aplikacja znalazła w odczytanym tekście umowy fragment powiązany z tym punktem; wymaga oceny, czy informacja jest pełna i konkretna."
        : "W odczytanym tekście nie znaleziono typowych słów ani fragmentów dla tego punktu. Jeśli PDF jest skanem słabej jakości, uruchom analizę ponownie na wyraźniejszym pliku.",
      score: quote ? "do ręcznej weryfikacji" : "nie znaleziono w odczytanym tekście",
      source: row.source,
    };
  });
}

function extractJsonArray(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");

  if (start < 0 || end <= start) return [];

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeAuditRows(rawRows: unknown[], contractText = "") {
  const fallbackRows = fallbackRowsFromContract(contractText);

  return focusedSkdRows.map((expected) => {
    const raw = rawRows.find((row) => {
      if (!row || typeof row !== "object") return false;
      const value = row as Record<string, unknown>;
      return Number(value.lp) === expected.index || String(value.podstawa ?? "").includes(expected.source);
    }) as Record<string, unknown> | undefined;
    const fallback = fallbackRows.find((row) => row.source === expected.source);
    const rawQuote = tableCell(raw?.cytatZUmowy, "");
    const hasRawQuote = rawQuote && !/^nie znaleziono$/i.test(rawQuote);

    return {
      check: expected.check,
      quote: hasRawQuote ? rawQuote : fallback?.quote ?? "nie znaleziono",
      reason: tableCell(raw?.dlaczego, fallback?.reason ?? "Sprawdź ręcznie w odczytanym tekście umowy."),
      score: tableCell(raw?.ocena, fallback?.score ?? "do ręcznej weryfikacji"),
      source: expected.source,
    };
  });
}

function renderAnalysisMarkdown(rows: ReturnType<typeof normalizeAuditRows>, sources: string[]) {
  const problematic = rows.filter((row) => !/^ok$/i.test(row.score));
  const summary =
    problematic.length > 0
      ? `Wstępna analiza wykazała ${problematic.length} punktów wymagających uwagi albo ręcznej weryfikacji. Poniżej tabela sprawdza po kolei tylko wskazane podstawy: art. 30 ust. 1 pkt 7, 10, 15 i 16 u.k.k.`
      : "Wstępna analiza nie wykazała oczywistych naruszeń w sprawdzanej checkliście, ale wynik nadal wymaga potwierdzenia przez specjalistę na pełnym dokumencie.";

  const table = [
    "| Punkt | Podstawa | Co sprawdzam | Cytat z umowy / brak | Ocena | Dlaczego |",
    "|---:|---|---|---|---|---|",
    ...rows.map(
      (row, index) =>
        `| ${index + 1} | ${tableCell(row.source)} | ${tableCell(row.check)} | ${tableCell(row.quote)} | ${tableCell(row.score)} | ${tableCell(row.reason)} |`,
    ),
  ].join("\n");

  const issueList = problematic.length
    ? problematic
        .map((row, index) => `${index + 1}. **${row.source}** — ${row.score}. ${row.reason}`)
        .join("\n")
    : "Brak pozycji oznaczonych jako naruszenie w automatycznej weryfikacji.";

  return `## Wstępny wynik
${summary}

## Weryfikacja checklisty SKD
${table}

## Punkty naruszone albo do ręcznej weryfikacji
${issueList}

## Czego nie można potwierdzić
Elementy oznaczone jako "nie znaleziono" albo "do ręcznej weryfikacji" wymagają sprawdzenia w pełnym PDF-ie oraz w załącznikach do umowy.

## Następne kroki
1. Sprawdź ręcznie cytaty oznaczone jako "nie znaleziono".
2. Porównaj wartości z kalkulatorem SKD, zwłaszcza RRSO, całkowitą kwotę do zapłaty i koszty pozaodsetkowe.
3. Potwierdź wynik z prawnikiem/specjalistą przed wysłaniem reklamacji.

## Źródła z bazy wiedzy
${sources.join(", ") || "Ustawa o kredycie konsumenckim"}`;
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
      const article29Text = "";
      const article30Text = articleWindow(fullLawText, 30, 31);
      const article45Text = articleWindow(fullLawText, 45, 46);
      const article36aText = "";
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
        article29Text
          ? {
              added_at: documentKnowledge.results[0]?.added_at ?? null,
              content: article29Text,
              metadata: { source: "art. 29", priority: "exact" },
              similarity: 2,
              title: "Ustawa o kredycie konsumenckim - art. 29",
            }
          : null,
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
        article36aText
          ? {
              added_at: documentKnowledge.results[0]?.added_at ?? null,
              content: article36aText,
              metadata: { source: "art. 36a", priority: "exact" },
              similarity: 2,
              title: "Ustawa o kredycie konsumenckim - art. 36a",
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

OBOWIAZKOWY FORMAT RAPORTU:
Nie zaczynaj i nie koncz sekcji "Weryfikacja" pojedynczym naglowkiem tabeli. Nie zwracaj pustej tabeli.
Najwazniejsza sekcja ma nazywac sie "Weryfikacja checklisty SKD" i ma zawierac wszystkie pozycje z "CHECKLISTA NARUSZEN SKD DO SPRAWDZENIA".
Dla kazdej pozycji napisz krotko:
- Podstawa
- Co sprawdzam
- Co znaleziono w umowie: cytat albo "nie znaleziono"
- Ocena: OK / naruszone / możliwe naruszenie / do ręcznej weryfikacji / nie znaleziono w odczytanym tekście
- Dlaczego

KONTEKST SPRAWY:
Bank: ${bank}
Produkt: ${product}
Kalkulacja: ${calculationSummary}

BAZA WIEDZY:
${knowledgeText}

CHECKLISTA ART. 30 Z DOKUMENTU SYSTEMOWEGO:
${article30PointChecklist}

CHECKLISTA NARUSZEN SKD DO SPRAWDZENIA:
${focusedSkdRows.map((row) => `${row.index}. ${row.source} - ${row.check}`).join("\n")}

OSTATECZNY FORMAT ODPOWIEDZI:
Zwróć wyłącznie JSON array, bez Markdown i bez komentarza. Array ma mieć dokładnie 4 obiekty w kolejności checklisty.
Pola każdego obiektu: lp, podstawa, cytatZUmowy, ocena, dlaczego.
Jeśli czegoś nie ma w umowie, wpisz cytatZUmowy: "nie znaleziono" i ocena: "nie znaleziono w odczytanym tekście".

ODCZYTANY I ZANONIMIZOWANY TEKST UMOWY:
${contractText}`,
      temperature: 0.1,
      timeout: { totalMs: 55000 },
    });

    const [analysisPart, cardPart] = result.text.split("[[FISZKA_KLIENTA]]");
    let rawAuditRows = extractJsonArray(result.text);

    if (!rawAuditRows.length) {
      const retryAudit = await generateText({
        maxOutputTokens: 4500,
        maxRetries: 0,
        model: google(googleModelIds.flash),
        prompt: `Zwróć wyłącznie JSON array dla analizy SKD. Bez Markdown. Dokładnie 4 obiekty.
Każdy obiekt: lp, podstawa, cytatZUmowy, ocena, dlaczego.
Ocena: OK / naruszone / możliwe naruszenie / do ręcznej weryfikacji / nie znaleziono w odczytanym tekście.

CHECKLISTA:
${focusedSkdRows.map((row) => `${row.index}. ${row.source} - ${row.check}`).join("\n")}

TEKST UMOWY:
${contractText}`,
        temperature: 0,
        timeout: { totalMs: 45000 },
      });
      rawAuditRows = extractJsonArray(retryAudit.text);
    }

    const parsedAuditRows = normalizeAuditRows(rawAuditRows, contractText);
    const deterministicAnalysis = renderAnalysisMarkdown(parsedAuditRows, sourceDocuments);
    const clientCardText = cardPart?.trim();
    const generatedClientCard =
      clientCardText ||
      (
        await generateText({
          maxOutputTokens: 2200,
          maxRetries: 0,
          model: google(googleModelIds.flash),
          prompt: clientCardPrompt(deterministicAnalysis, bank, product, calculationSummary),
          temperature: 0.15,
          timeout: { totalMs: 45000 },
        })
      ).text.trim();

    return Response.json({
      analysis: deterministicAnalysis || analysisPart.trim(),
      clientCard: generatedClientCard,
      sources: sourceDocuments,
    });
  } catch (error) {
    return Response.json(
      { error: getModelErrorMessage(error, "flash") },
      { status: 500 },
    );
  }
}
