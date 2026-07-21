import { google } from "@ai-sdk/google";
import { GoogleGenAI, Modality } from "@google/genai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  convertToModelMessages,
  generateText,
  isStepCount,
  jsonSchema,
  streamText,
  tool,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from "ai";
import { getModelErrorMessage } from "../../lib/errors";
import {
  getAiModel,
  googleImageModelIds,
  googleModelIds,
  type AiModel,
} from "../../lib/models";
import {
  searchKnowledgeBase,
  type KnowledgeSearchResponse,
} from "../../lib/knowledgeSearch";
import { reactTools } from "../../lib/reactTools";
import { supabase } from "../../lib/supabase";

export const maxDuration = 60;

type ChatMode =
  | "casual"
  | "ekspert"
  | "kreatywny"
  | "search"
  | "vision"
  | "agent"
  | "analyzer";
type CalculatorInput = {
  expression: string;
};

type CalculatorOutput = {
  expression: string;
  result: string;
};

type CurrentDateTimeInput = {
  timezone?: string;
};

type CurrentDateTimeOutput = {
  iso: string;
  timezone: string;
  formatted: string;
};

type GenerateImageInput = {
  prompt: string;
};

type GenerateImageOutput = {
  error?: string;
  image?: string;
  model?: AiModel;
  prompt: string;
  text: string;
};

type ReadWebPageInput = {
  url: string;
};

type SearchKnowledgeInput = {
  query: string;
};

type SearchKnowledgeOutput = KnowledgeSearchResponse;

type SaveUserNameInput = {
  name: string;
};

type SaveUserPreferenceInput = {
  key: string;
  value: string;
};

type WebSource = {
  sourceType?: string;
  title?: string;
  url?: string;
};

type ChatRequestBody = {
  image?: unknown;
  messages: UIMessage[];
  mode?: unknown;
  model?: unknown;
  userId?: unknown;
};

type StoredUserProfile = {
  displayName: string | null;
  preferences: Record<string, string>;
};

type ParsedImage = {
  base64Data: string;
  mediaType: string;
};

type ImagePart = {
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
  text?: string;
};

const professionalPersona = `# Marta — Ekspert analiz kredytowych ds. sankcji kredytu darmowego

## KIM JESTEM
Jestem ekspertem analiz kredytowych z 10-letnim doświadczeniem w branży kredytów konsumenckich i analiz umów finansowych.
Specjalizuję się w sankcji kredytu darmowego, analizie RRSO i całkowitego kosztu kredytu oraz weryfikacji formularzy informacyjnych i harmonogramów spłaty.
Pracowałam z konsumentami, zespołami obsługi spraw kredytowych oraz kancelariami analizującymi dokumentację bankową.

## JAK ODPOWIADAM
1. 📋 **Kontekst** — potwierdzam zrozumienie pytania.
2. 🔍 **Analiza** — odpowiadam konkretnie, bez rozwlekania.
3. ✅ **Rekomendacja** — wskazuję następny praktyczny krok.
4. ❓ **Pytanie** — kończę jednym pytaniem do użytkownika.

## CZEGO NIE ROBIĘ
- Nie odpowiadam na pytania spoza mojej dziedziny — mówię: "To nie moja specjalizacja, ale mogę pomóc z sankcją kredytu darmowego".
- Nie przesądzam, że SKD na pewno przysługuje bez analizy dokumentów.
- Nie udzielam ostatecznych porad prawnych; wskazuję ryzyka i przesłanki analityczne.`;

const memoryInstructions = `## PAMIĘĆ
- Pamiętasz rozmowę w zakresie potrzebnym do odpowiedzi.
- Jeśli użytkownik napisze "podsumuj", streszczasz ustalenia w punktach.`;

const responseFormatInstructions = `## OBOWIĄZKOWY FORMAT ODPOWIEDZI
- Każdą merytoryczną odpowiedź przedstaw w czterech krótkich, wyraźnie oznaczonych częściach: **Kontekst**, **Analiza**, **Rekomendacja**, **Pytanie**.
- W części „Analiza” podaj konkretną odpowiedź. W „Rekomendacji” wskaż praktyczny następny krok wynikający wyłącznie z dostępnych faktów.
- Ostatnia część ma zawierać jedno pytanie, które logicznie wynika z odpowiedzi.
- Nie zaczynaj każdej odpowiedzi od powitania ani od pytania o imię. Jeśli imię użytkownika jest zapisane, nigdy nie pytaj o nie ponownie.`;

const commandInstructions = `## KOMENDY BIZNESOWE
Agent obsługuje dwie komendy lokalne:
- /dokumenty
- /naruszenia

Nie proponuj innych komend.`;

const analyzerInstructions = `## ANALIZATOR SKD
Gdy użytkownik korzysta z Analizatora albo prosi o analizę umowy:
- Najpierw ustal status kredytu: aktywny, spłacony terminowo, spłacony przed terminem albo z opóźnieniami.
- Sprawdź, czy są dokumenty: umowa z załącznikami, formularz informacyjny, harmonogram, historia spłaty, potwierdzenie całkowitej spłaty i informacja o zwrocie prowizji.
- Analizuj wstępnie: kwotę kredytu netto/brutto, kredytowane koszty, prowizję, ubezpieczenie, RRSO, całkowitą kwotę do zapłaty, zasady wcześniejszej spłaty, odstąpienie, zmianę oprocentowania i opłaty.
- Jeżeli użytkownik wklei screenshot albo zdjęcie dokumentu, najpierw odczytaj widoczny tekst, a potem wskaż możliwe braki i ryzyka.
- Zawsze oddziel: "Co widzę", "Możliwe ryzyka", "Czego brakuje", "Następny krok".
- Nie przesądzaj wygranej; mów o przesłankach do dalszej weryfikacji.`;

const systemPrompts: Record<ChatMode, string> = {
  casual: `${professionalPersona}

## TRYB: CASUAL
Odpowiadaj luźniej, ale nadal merytorycznie i tylko w zakresie SKD.

${memoryInstructions}

${commandInstructions}`,
  ekspert: `${professionalPersona}

## TRYB: EKSPERT
Odpowiadaj formalnie, analitycznie i po polsku. Dbaj o precyzję, ale nie twórz długich elaboratów.

${memoryInstructions}

${commandInstructions}`,
  kreatywny: `${professionalPersona}

## TRYB: KREATYWNY
Używaj prostych analogii i przykładów, ale nie wychodź poza sankcję kredytu darmowego.

${memoryInstructions}

${commandInstructions}`,
  analyzer: `${professionalPersona}

## TRYB: ANALIZATOR
Odpowiadaj po polsku jako osobny analizator SKD, nie jako komenda głównego chata.

${memoryInstructions}

${analyzerInstructions}`,
  search: `# Agent z wyszukiwarką

Jesteś pomocnym agentem, który odpowiada po polsku na pytania ogólne i aktualne.
Masz dostęp do prawdziwego internetu przez Google Search oraz możesz czytać wskazane strony WWW.

## JAK ODPOWIADASZ
- Odpowiadaj konkretnie i jasno.
- Gdy temat jest aktualny, sprawdzaj informacje w internecie.
- Gdy użytkownik poda URL, przeczytaj stronę narzędziem readWebPage i streść najważniejsze informacje.
- Jeśli korzystasz ze źródeł, pokazuj je jako klikalne linki markdown.`,
  vision: `# Agent Vision

Jesteś agentem do analizy obrazów, screenshotów i zdjęć.

## JAK ODPOWIADASZ
- Opisuj konkretnie to, co widzisz na obrazie.
- Jeśli użytkownik prosi o tekst, wykonaj OCR i wypisz tekst możliwie wiernie.
- Jeśli użytkownik pyta o kolory, podaj dominujące barwy i szacunkowe kody HEX.
- Jeśli użytkownik pyta o błąd na screenie, wyjaśnij prawdopodobną przyczynę i następny krok.
- Odpowiadaj po polsku, zwięźle i praktycznie.`,
  agent: `# Agent AI - Pełna moc

Jesteś autonomicznym agentem po polsku. Masz dostęp do wielu narzędzi i sam decydujesz, których użyć do zadania.

## DOSTĘPNE NARZĘDZIA
- calculator - obliczenia, VAT, kwoty brutto/netto, proste działania matematyczne.
- currentDateTime - aktualna data i czas.
- google_search - aktualne informacje z internetu.
- readWebPage - czytanie wskazanych stron WWW.
- generateImage - generowanie logo, grafik, ilustracji i postów wizualnych.
- analiza obrazu - gdy użytkownik wklei screenshot albo zdjęcie.

## JAK DZIAŁASZ
- Przy zadaniach złożonych użyj kilku narzędzi krok po kroku.
- Gdy użytkownik prosi o aktualne dane, najpierw sprawdź internet.
- Gdy użytkownik poda adres strony, przeczytaj ją narzędziem readWebPage.
- Gdy prosi o logo, grafikę albo ilustrację, użyj generateImage.
- Gdy pytanie dotyczy liczb, użyj calculator i pokaż wynik.
- Odpowiedź końcowa ma być konkretna, praktyczna i po polsku.`,
};

const MAX_MESSAGES_TO_SEND = 4;

const stabilityInstructions = `## LIMIT STABILNOŚCI ODPOWIEDZI
- Odpowiadaj krótko i kończ pełnym zdaniem.
- Tryb krótki: maksymalnie 120 słów.
- Tryb dokładniejszy: maksymalnie 220 słów.
- Zwykle wystarczy 3-5 punktów.
- Zawsze zakończ jednym konkretnym pytaniem do użytkownika.`;

const webInstructions = `## INTERNET I ŹRÓDŁA
- Masz dostęp do Google Search oraz narzędzia readWebPage.
- Używaj Google Search, gdy pytanie wymaga aktualnych informacji, cen, kursów, wiadomości, wyników sportowych lub obecnych osób/funkcji.
- Używaj readWebPage, gdy użytkownik poda URL albo gdy chcesz przeczytać konkretną stronę znalezioną w wyszukiwarce.
- Gdy korzystasz z internetu, podawaj źródła jako linki markdown.`;

const knowledgeInstructions = `## BAZA WIEDZY FIRMY
- Narzędzie searchKnowledge jest aktywne i dostępne w tej rozmowie. Nie twierdź, że nie masz do niego dostępu — wywołaj je.
- Masz dostęp do narzędzia searchKnowledge, które przeszukuje firmową bazę wiedzy.
- ZAWSZE użyj searchKnowledge przed odpowiedzią na pytania o ceny, pakiety, koszty, ofertę, usługi firmy, procedury, regulaminy i FAQ.
- Każde pytanie o cenę, pakiet, ofertę lub rezygnację kieruj najpierw do searchKnowledge, nawet jeśli nazwa wygląda jak produkt zewnętrzny.
- Odpowiadając na pytanie firmowe, korzystaj wyłącznie z fragmentów zwróconych przez searchKnowledge. Nie dopowiadaj informacji z pamięci modelu.
- Gdy searchKnowledge zwróci wyniki, na końcu odpowiedzi ZAWSZE dodaj osobną linię w formacie: "📎 Źródło: [tytuł dokumentu]". Gdy wykorzystujesz kilka dokumentów, użyj: "📎 Źródła: [tytuł 1], [tytuł 2]". Cytuj dokładnie tytuły z pola source_documents.
- Gdy searchKnowledge zwróci 0 wyników albo nie zawiera fragmentu odpowiadającego na pytanie, nie używaj wiedzy ogólnej, nie podawaj linków ani rekomendacji zewnętrznych. Wtedy cała odpowiedź ma brzmieć dokładnie: "Nie mam informacji na ten temat w mojej bazie wiedzy. Skontaktuj się z firmą bezpośrednio."
- Priorytety narzędzi: pytania firmowe i cenowe -> searchKnowledge; wiedza ogólna i aktualne informacje -> Google Search lub inne właściwe narzędzie; obliczenia -> calculator.
- Nie używaj searchKnowledge do pytań ogólnych niezwiązanych z cenami, ofertą ani firmą, np. o pogodę.`;

const generalToolsInstructions = `## PYTANIA OGÓLNE I AKTUALNE DANE
- Możesz odpowiadać na pytania spoza SKD, gdy masz do tego odpowiednie narzędzie. Nie odmawiaj automatycznie tylko dlatego, że temat nie dotyczy sankcji kredytu darmowego.
- Gdy użytkownik pyta o aktualną pogodę, ZAWSZE użyj getWeather z nazwą miasta (np. getWeather("Warszawa")).
- Gdy użytkownik chce sprawdzić aktualne informacje w internecie, użyj google_search.
- Pytania o cenę, pakiet, ofertę, regulamin, FAQ lub usługi nadal rozpoczynaj od searchKnowledge — także wtedy, gdy dotyczą produktu zewnętrznego, np. Tesli.
- Nie używaj searchKnowledge do pogody ani innych pytań ogólnych niezwiązanych z firmą.`;

const imageInstructions = `## OBRAZY
- Użytkownik może dołączyć obraz, screenshot albo zdjęcie.
- Gdy obraz jest dołączony, analizuj zawartość obrazu, rozpoznawaj tekst i odpowiadaj na pytanie o obraz.
- Jeśli pytanie dotyczy kolorów, opisz dominujące kolory i podaj przybliżone kody HEX.`;

function getGoogleApiKey() {
  return process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
}

function getApiErrorStatus(error: unknown) {
  return typeof error === "object" &&
    error != null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(
      () => reject(new Error("IMAGE_GENERATION_TIMEOUT")),
      timeoutMs,
    );

    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function calculateExpression(expression: string): CalculatorOutput {
  const normalized = expression
    .replace(/,/g, ".")
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");

  if (!/^[\d+\-*/().\s]+$/.test(normalized)) {
    return {
      expression,
      result: "Nie udało się obliczyć: użyj tylko liczb i operatorów + - * / ( ).",
    };
  }

  try {
    const value = Function(`"use strict"; return (${normalized});`)();

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Invalid result");
    }

    return {
      expression,
      result: Number(value.toFixed(6)).toString(),
    };
  } catch {
    return {
      expression,
      result: "Nie udało się obliczyć podanego wyrażenia.",
    };
  }
}

function getCurrentDateTime(timezone = "Europe/Warsaw"): CurrentDateTimeOutput {
  const now = new Date();

  return {
    formatted: new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "full",
      timeStyle: "medium",
      timeZone: timezone,
    }).format(now),
    iso: now.toISOString(),
    timezone,
  };
}

async function generateImageFromPrompt(
  prompt: string,
  model: AiModel = "flash",
): Promise<GenerateImageOutput> {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    return {
      error: "Brakuje promptu obrazu.",
      prompt,
      text: "Nie mogę wygenerować obrazu bez opisu.",
    };
  }

  const apiKey = getGoogleApiKey();

  if (!apiKey) {
    return {
      error:
        "Brakuje klucza Google API. Ustaw GOOGLE_API_KEY albo GOOGLE_GENERATIVE_AI_API_KEY.",
      prompt: trimmedPrompt,
      text: "Nie mogę teraz wygenerować obrazu, bo nie ma klucza API.",
    };
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const imagePrompt = `Generate an image from this user description. Return an image, not only text. User description: ${trimmedPrompt}`;

    const response = await withTimeout(
      ai.models.generateContent({
        config: {
          imageConfig: {
            aspectRatio: "1:1",
          },
          responseModalities: [Modality.TEXT, Modality.IMAGE],
        },
        contents: imagePrompt,
        model: googleImageModelIds[model],
      }),
      30000,
    );

    const parts =
      (response.candidates?.[0]?.content?.parts as ImagePart[] | undefined) ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data);
    const text =
      parts
        .filter((part) => typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
        .trim() || "Obraz został wygenerowany.";

    if (!imagePart?.inlineData?.data) {
      return {
        error:
          "Model nie zwrócił obrazu. Spróbuj doprecyzować opis i wygenerować ponownie.",
        prompt: trimmedPrompt,
        text,
      };
    }

    const mimeType = imagePart.inlineData.mimeType ?? "image/png";

    return {
      image: `data:${mimeType};base64,${imagePart.inlineData.data}`,
      model,
      prompt: trimmedPrompt,
      text,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "IMAGE_GENERATION_TIMEOUT") {
      return {
        error: "Generowanie obrazu przekroczyło limit 30 sekund. Spróbuj ponownie.",
        prompt: trimmedPrompt,
        text: "Nie udało się wygenerować obrazu w limicie czasu.",
      };
    }

    if (getApiErrorStatus(error) === 429) {
      return {
        error:
          "Limit Google API dla modelu obrazowego jest teraz wyczerpany. Spróbuj ponownie później albo sprawdź limity projektu w Google AI Studio.",
        prompt: trimmedPrompt,
        text: "Nie udało się wygenerować obrazu z powodu limitu API.",
      };
    }

    return {
      error: "Nie udało się wygenerować obrazu. Sprawdź prompt i spróbuj ponownie.",
      prompt: trimmedPrompt,
      text: "Nie udało się wygenerować obrazu.",
    };
  }
}

const knowledgeTools = {
  searchKnowledge: tool<SearchKnowledgeInput, SearchKnowledgeOutput, {}>({
    description:
      "Przeszukuje firmową bazę wiedzy. Zawsze używaj do pytań o ceny, pakiety, koszty, procedury, regulaminy, FAQ, ofertę i usługi firmy.",
    inputSchema: jsonSchema<SearchKnowledgeInput>({
      additionalProperties: false,
      properties: {
        query: {
          description:
            "Konkretne pytanie użytkownika albo krótka fraza do wyszukania w bazie wiedzy.",
          type: "string",
        },
      },
      required: ["query"],
      type: "object",
    }),
    execute: ({ query }) => searchKnowledgeBase(query),
  }),
};

const webTools = {
  google_search: google.tools.googleSearch({}),
  readWebPage: tool<ReadWebPageInput, string, {}>({
    description:
      "Pobiera i czyta zawartość strony internetowej. Używaj gdy użytkownik poda URL lub gdy chcesz przeczytać artykuł/stronę znalezioną w wyszukiwarce.",
    inputSchema: jsonSchema<ReadWebPageInput>({
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Pełny adres URL strony internetowej.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    }),
    execute: ({ url }) => readWebPage(url),
  }),
};

function createPersonalizationTools(userId: string, profileSupabase: SupabaseClient) {
  return {
    saveUserName: tool<
      SaveUserNameInput,
      { error?: string; name?: string; saved: boolean },
      {}
    >({
      description:
        "Zapisuje imię użytkownika w jego profilu. Użyj zawsze, gdy użytkownik poda swoje imię.",
      inputSchema: jsonSchema<SaveUserNameInput>({
        additionalProperties: false,
        properties: {
          name: {
            description: "Samo imię użytkownika, bez dodatkowych słów.",
            type: "string",
          },
        },
        required: ["name"],
        type: "object",
      }),
      execute: async ({ name }) => {
        const normalizedName = name.trim().replace(/\s+/g, " ").slice(0, 80);

        if (!userId || !normalizedName) {
          return {
            error: "Brakuje identyfikatora użytkownika albo poprawnego imienia.",
            saved: false,
          };
        }

        const { error } = await profileSupabase.from("user_profiles").upsert(
          { id: userId, display_name: normalizedName },
          { onConflict: "id" },
        );

        return error
          ? { error: error.message, saved: false }
          : { name: normalizedName, saved: true };
      },
    }),
    saveUserPreference: tool<
      SaveUserPreferenceInput,
      { error?: string; key?: string; saved: boolean; value?: string },
      {}
    >({
      description:
        "Dopisuje trwałą preferencję użytkownika do JSONB preferences bez usuwania poprzednich wartości.",
      inputSchema: jsonSchema<SaveUserPreferenceInput>({
        additionalProperties: false,
        properties: {
          key: {
            description:
              "Krótki klucz preferencji zapisany małymi literami, np. miasto albo zainteresowania.",
            type: "string",
          },
          value: {
            description: "Wartość preferencji podana przez użytkownika.",
            type: "string",
          },
        },
        required: ["key", "value"],
        type: "object",
      }),
      execute: async ({ key, value }) => {
        const normalizedKey = key
          .trim()
          .toLocaleLowerCase("pl-PL")
          .replace(/\s+/g, "_")
          .slice(0, 60);
        const normalizedValue = value.trim().replace(/\s+/g, " ").slice(0, 240);

        if (!userId || !normalizedKey || !normalizedValue) {
          return {
            error: "Brakuje identyfikatora użytkownika lub poprawnej preferencji.",
            saved: false,
          };
        }

        const currentProfile = await getStoredUserProfile(userId, profileSupabase);
        const preferences = {
          ...currentProfile.preferences,
          [normalizedKey]: normalizedValue,
        };
        const { error } = await profileSupabase.from("user_profiles").upsert(
          { id: userId, preferences },
          { onConflict: "id" },
        );

        return error
          ? { error: error.message, saved: false }
          : {
              key: normalizedKey,
              saved: true,
              value: normalizedValue,
            };
      },
    }),
  };
}

const agentTools = {
  ...webTools,
  ...reactTools,
  ...knowledgeTools,
  calculator: tool<CalculatorInput, CalculatorOutput, {}>({
    description:
      "Liczy bezpieczne wyrażenia matematyczne. Używaj do VAT, kwot netto/brutto, procentów i prostych obliczeń.",
    inputSchema: jsonSchema<CalculatorInput>({
      additionalProperties: false,
      properties: {
        expression: {
          description:
            "Wyrażenie matematyczne, np. 8500 * 0.23 albo 8500 + (8500 * 0.23).",
          type: "string",
        },
      },
      required: ["expression"],
      type: "object",
    }),
    execute: ({ expression }) => calculateExpression(expression),
  }),
  currentDateTime: tool<CurrentDateTimeInput, CurrentDateTimeOutput, {}>({
    description:
      "Zwraca aktualną datę i godzinę. Używaj, gdy pytanie zależy od obecnego czasu.",
    inputSchema: jsonSchema<CurrentDateTimeInput>({
      additionalProperties: false,
      properties: {
        timezone: {
          description: "Strefa czasowa IANA. Domyślnie Europe/Warsaw.",
          type: "string",
        },
      },
      type: "object",
    }),
    execute: ({ timezone }) => getCurrentDateTime(timezone || "Europe/Warsaw"),
  }),
  generateImage: tool<GenerateImageInput, GenerateImageOutput, {}>({
    description:
      "Generuje obraz na podstawie opisu. Używaj gdy użytkownik prosi o logo, grafikę, ilustrację lub post wizualny.",
    inputSchema: jsonSchema<GenerateImageInput>({
      additionalProperties: false,
      properties: {
        prompt: {
          description: "Opis obrazu do wygenerowania.",
          type: "string",
        },
      },
      required: ["prompt"],
      type: "object",
    }),
    execute: ({ prompt }) => generateImageFromPrompt(prompt),
    toModelOutput: ({ output }) => ({
      type: "text",
      value: output.error
        ? `Nie udało się wygenerować obrazu: ${output.error}`
        : `Wygenerowano obraz dla promptu: ${output.prompt}. ${output.text}`,
    }),
  }),
};

function createAgentTools(selectedModel: AiModel) {
  return {
    ...agentTools,
    generateImage: tool<GenerateImageInput, GenerateImageOutput, {}>({
      description:
        "Generuje obraz na podstawie opisu. Używaj gdy użytkownik prosi o logo, grafikę, ilustrację lub post wizualny.",
      inputSchema: jsonSchema<GenerateImageInput>({
        additionalProperties: false,
        properties: {
          prompt: {
            description: "Opis obrazu do wygenerowania.",
            type: "string",
          },
        },
        required: ["prompt"],
        type: "object",
      }),
      execute: ({ prompt }) => generateImageFromPrompt(prompt, selectedModel),
      toModelOutput: ({ output }) => ({
        type: "text",
        value: output.error
          ? `Nie udało się wygenerować obrazu: ${output.error}`
          : `Wygenerowano obraz dla promptu: ${output.prompt}. ${output.text}`,
      }),
    }),
  };
}

const violations = [
  "art. 29 ust. 1 u.k.k. - Brak przekazania Umowy na trwałym nośniku - brak transparentności",
  "art. 30 ust. 1 pkt 4 u.k.k. - Niejednoznaczne określenie kwoty kredytu wprowadzające w błąd co do kwoty kredytu netto",
  "art. 30 ust. 1 pkt 5 u.k.k. - Niejasne zasady i terminy wypłaty kredytu - brak możliwości określenia terminu rzeczywistego otrzymania środków",
  "art. 30 ust. 1 pkt 6 u.k.k. - Nieprecyzyjna klauzula zmiennego oprocentowania - możliwość dowolnego kształtowania kosztu kredytu",
  "art. 30 ust. 1 pkt 6 u.k.k. - Przyjęcie wadliwych kryteriów do wyliczenia oprocentowania",
  "art. 30 ust. 1 pkt 7 u.k.k. - Błędnie obliczone RRSO oraz całkowita kwota do zapłaty - zawyżony koszt kredytu",
  "art. 30 ust. 1 pkt 10 u.k.k. - Brak skonkretyzowanych warunków zmiany kosztów i opłat bankowych",
  "art. 30 ust. 1 pkt 11 u.k.k. - Brak jasnych zasad naliczania i informowania o odsetkach za opóźnienie",
  "art. 30 ust. 1 pkt 14 u.k.k. - Brak wymaganych informacji o ubezpieczeniu oraz sposobie jego sprzedaży",
  "art. 30 ust. 1 pkt 15 u.k.k. - Brak możliwości określenia rzeczywistego rozpoczęcia biegu terminu odstąpienia od Umowy",
  "art. 30 ust. 1 pkt 15 u.k.k. - Brak informacji o skutkach odstąpienia od Umowy",
  "art. 30 ust. 1 pkt 15 u.k.k. - Ograniczenie formy odstąpienia do formy pisemnej",
  "art. 30 ust. 1 pkt 15 u.k.k. - Brak wskazania dziennych odsetek w kontekście odstąpienia - brak możliwości oceny kosztu kredytu w krótkim okresie",
  "art. 30 ust. 1 pkt 15 u.k.k. - Zastosowanie konwencji 360 dni w roku - zawyżenie dziennego kosztu odsetek, a tym samym podniesienie kosztu kredytu w krótkim czasie",
  "art. 30 ust. 1 pkt 15 u.k.k. - Zastosowanie kwoty brutto zamiast netto - zawyżenie dziennego kosztu odsetek, a tym samym podniesienie kosztu kredytu w krótkim czasie",
  "art. 30 ust. 1 pkt 16 u.k.k. - Brak informacji o terminie rozliczenia Umowy wykonanej przed terminem",
  "art. 30 ust. 1 pkt 16 u.k.k. - Niepełna informacja o zasadach wcześniejszej spłaty kredytu",
  "art. 30 ust. 1 pkt 16 u.k.k. - Wymóg pisemnej dyspozycji wcześniejszej spłaty - utrudnienie korzystania z prawa do wcześniejszej spłaty",
  "art. 36a u.k.k. - Nieuprawnione podwyższenie całkowitej wartości kredytu ponad ustawowy limit",
];

function getMode(value: unknown): ChatMode {
  if (
    value === "ekspert" ||
    value === "kreatywny" ||
    value === "search" ||
    value === "vision" ||
    value === "agent" ||
    value === "analyzer"
  ) {
    return value;
  }

  return "casual";
}

function getNameFromIntroduction(text: string): string | null {
  const trimmedText = text.trim();
  const introductionMatch = trimmedText.match(
    /(?:mam na imię|nazywam się)\s+([\p{L}][\p{L}'-]{1,39})/iu,
  );
  const capitalizedJestemMatch = trimmedText.match(
    /jestem\s+([\p{Lu}][\p{L}'-]{1,39})/u,
  );
  const standaloneNameMatch = trimmedText.match(
    /^([\p{Lu}][\p{L}'-]{1,39})[.!]?$/u,
  );
  const name =
    introductionMatch?.[1] ??
    capitalizedJestemMatch?.[1] ??
    standaloneNameMatch?.[1];

  return name ? name.trim().replace(/\s+/g, " ").slice(0, 80) : null;
}

async function saveDetectedUserName(
  userId: string,
  name: string,
  profileSupabase: SupabaseClient,
) {
  const { error } = await profileSupabase.from("user_profiles").upsert(
    { id: userId, display_name: name },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(`Nie udało się zapisać imienia użytkownika: ${error.message}`);
  }
}

async function getStoredUserProfile(
  userId: string,
  profileSupabase: SupabaseClient,
): Promise<StoredUserProfile> {
  const { data, error } = await profileSupabase
    .from("user_profiles")
    .select("display_name, preferences")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return { displayName: null, preferences: {} };
  }

  return {
    displayName:
      typeof data.display_name === "string" && data.display_name.trim()
        ? data.display_name
        : null,
    preferences:
      data.preferences &&
      typeof data.preferences === "object" &&
      !Array.isArray(data.preferences)
        ? (data.preferences as Record<string, string>)
        : {},
  };
}

function createPersonalizationPrompt(profile: StoredUserProfile) {
  const preferenceEntries = Object.entries(profile.preferences);
  const preferenceText =
    preferenceEntries.length > 0
      ? preferenceEntries.map(([key, value]) => `${key}: ${value}`).join(", ")
      : "brak zapisanych preferencji";

  if (profile.displayName) {
    return `## PERSONALIZACJA UŻYTKOWNIKA
Rozmawiasz z użytkownikiem: ${profile.displayName}.
Użytkownik ma na imię ${profile.displayName}.
Zwracaj się do niego po imieniu i bądź ciepły oraz personalny — to Twój stały użytkownik.
Nie pytaj ponownie o jego imię ani nie zaczynaj każdej odpowiedzi od powitania.
Zapisane preferencje: ${preferenceText}.
Używaj zapisanych preferencji tylko wtedy, gdy pasują do bieżącej rozmowy.
Gdy użytkownik poda nową trwałą preferencję, użyj narzędzia saveUserPreference.`;
  }

  return `## PERSONALIZACJA UŻYTKOWNIKA
Rozmawiasz z użytkownikiem: nieznany.
To nowy użytkownik. Przy pierwszej rozmowie zapytaj grzecznie o imię.
Gdy poda imię, obowiązkowo użyj narzędzia saveUserName, żeby je zapamiętać.
Gdy poda trwałą preferencję, użyj narzędzia saveUserPreference.
Nie twierdź, że zapisałeś dane, dopóki odpowiednie narzędzie nie zwróci powodzenia.`;
}

function getMessageText(message: UIMessage): string {
  return ((message.parts ?? []) as Array<{ type?: string; text?: unknown }>)
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? ""))
    .join("");
}

function shouldPrioritizeKnowledgeSearch(text: string): boolean {
  return /(cen(a|y|ę|nik)|koszt|pakiet|ofert|usług|procedur|regulamin|faq|rezygn)/i.test(
    text,
  );
}

function shouldUseWeatherTool(text: string): boolean {
  return /(pogod|temperatur|wiatr|wilgotn|deszcz|słonecz)/i.test(text);
}

function parseImageDataUrl(value: unknown): ParsedImage | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^data:(image\/(?:png|jpe?g|gif|webp));base64,(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    base64Data: match[2],
    mediaType: match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1],
  };
}

async function createModelMessages(
  recentMessages: UIMessage[],
  image: ParsedImage | null,
  tools?: ToolSet,
) {
  const modelMessages = (await convertToModelMessages(
    recentMessages,
    tools
      ? {
          ignoreIncompleteToolCalls: true,
          tools,
        }
      : undefined,
  )) as ModelMessage[];

  if (!image) {
    return modelMessages;
  }

  const lastUserMessage = [...recentMessages]
    .reverse()
    .find((message) => message.role === "user");
  const userText =
    lastUserMessage != null && getMessageText(lastUserMessage).trim()
      ? getMessageText(lastUserMessage).trim()
      : "Co widzisz na tym obrazie?";
  const lastUserIndex = modelMessages.findLastIndex(
    (message) => message.role === "user",
  );

  if (lastUserIndex === -1) {
    return modelMessages;
  }

  return modelMessages.map((message, index) =>
    index === lastUserIndex
      ? {
          role: "user",
          content: [
            {
              type: "image",
              image: image.base64Data,
              mediaType: image.mediaType,
            },
            {
              type: "text",
              text: userText,
            },
          ],
        }
      : message,
  ) satisfies ModelMessage[];
}

function decodeHtmlEntities(text: string) {
  const entities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };

  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }

    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }

    return entities[entity.toLowerCase()] ?? match;
  });
}

function extractTextFromHtml(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

async function readWebPage(url: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return "Nie udało się przeczytać strony: podany adres URL jest niepoprawny.";
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return "Nie udało się przeczytać strony: obsługiwane są tylko adresy HTTP i HTTPS.";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MartaAgent/1.0)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return `Nie udało się przeczytać strony: serwer zwrócił błąd HTTP ${response.status}.`;
    }

    const html = await response.text();
    const text = extractTextFromHtml(html).slice(0, 3000);

    if (!text) {
      return "Nie udało się przeczytać strony: nie znaleziono czytelnej treści tekstowej.";
    }

    return `Źródło: ${parsedUrl.toString()}\n\n${text}`;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return "Nie udało się przeczytać strony: przekroczono limit czasu 5 sekund.";
    }

    return "Nie udało się przeczytać strony: strona jest niedostępna albo odrzuciła połączenie.";
  } finally {
    clearTimeout(timeoutId);
  }
}

function appendSources(text: string, sources: WebSource[]) {
  const links = Array.from(
    new Map(
      sources
        .filter((source) => source.sourceType === "url" && source.url)
        .map((source) => [
          source.url,
          {
            title: source.title?.trim() || String(source.url),
            url: String(source.url),
          },
        ]),
    ).values(),
  ).slice(0, 6);

  if (links.length === 0) {
    return text;
  }

  const sourceList = links
    .map((source, index) => `${index + 1}. [${source.title}](${source.url})`)
    .join("\n");

  return `${text.trim()}\n\n### Źródła\n${sourceList}`;
}

function didKnowledgeSearchReturnNoResults(toolResults: unknown[]): boolean {
  return toolResults.some((toolResult) => {
    const result = toolResult as {
      output?: unknown;
      toolName?: unknown;
    };

    if (result.toolName !== "searchKnowledge" || !result.output) {
      return false;
    }

    const output = result.output as { total_found?: unknown };
    return output.total_found === 0;
  });
}

function createLocalUIMessageResponse(text: string) {
  const events = [
    { type: "start" },
    { type: "start-step" },
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: text },
    { type: "text-end", id: "0" },
    { type: "finish-step" },
    { type: "finish", finishReason: "stop" },
  ];

  const body = `${events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;

  return new Response(body, {
    headers: {
      "Cache-Control": "no-cache",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

function handleDokumenty() {
  return `### 📂 Dokumenty potrzebne do analizy SKD
Przygotuj:

1. **Umowę kredytową** - kompletną, z regulaminem, tabelą opłat, załącznikami i aneksami.
2. **Harmonogram spłat** - jeśli kredyt jest aktywny, harmonogram musi być **aktualny**.
3. **Historię spłaty kredytu** - koniecznie z podziałem na **kapitał** i **odsetki**.
4. **Jeśli kredyt jest spłacony:** potwierdzenie całkowitej spłaty wraz z informacją o **zwrocie prowizji**.

✅ Najlepiej zebrać dokumenty w PDF, bez ucinania stron i z czytelnymi datami.

❓ Czy Twój kredyt jest aktywny, czy już spłacony?`;
}

function handleNaruszenia() {
  const list = violations
    .map((violation, index) => `${index + 1}. ${violation}`)
    .join("\n");

  return `### 📑 Naruszenia analizowane pod SKD
Aktualnie sprawdzamy następujące naruszenia:

${list}

⚠️ Sama obecność podobnego zapisu w umowie nie oznacza automatycznie wygranej. Każde naruszenie trzeba zestawić z pełną umową, harmonogramem i historią spłaty.

❓ Czy chcesz najpierw przygotować dokumenty komendą \`/dokumenty\`?`;
}

function handleCommand(text: string) {
  const normalized = text.trim().toLowerCase();

  if (normalized.startsWith("/dokumenty")) {
    return handleDokumenty();
  }

  if (normalized.startsWith("/naruszenia")) {
    return handleNaruszenia();
  }

  if (
    normalized.startsWith("/oblicz")
  ) {
    return `Ta komenda została usunięta. Dostępne są teraz tylko:
* \`/dokumenty\`
* \`/naruszenia\`

❓ Którą z tych komend mam uruchomić?`;
  }

  if (normalized.startsWith("/")) {
    return `Nie znam tej komendy. Dostępne są tylko:
* \`/dokumenty\`
* \`/naruszenia\`

❓ Którą komendę mam uruchomić?`;
  }

  return null;
}

export async function POST(req: Request) {
  const { image, messages, mode, model }: ChatRequestBody =
    await req.json();
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!token || !supabaseUrl || !supabaseAnonKey) {
    return Response.json({ error: "Wymagane jest zalogowanie." }, { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) {
    return Response.json({ error: "Sesja logowania wygasła." }, { status: 401 });
  }

  const userId = user.id;
  const profileSupabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const parsedImage = parseImageDataUrl(image);
  const selectedMode = getMode(mode);
  const selectedModel = getAiModel(model);
  const recentMessages = messages.slice(
    selectedMode === "agent" ? -8 : -MAX_MESSAGES_TO_SEND,
  );
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user");
  const lastUserText = lastUserMessage ? getMessageText(lastUserMessage) : "";
  const commandResponse = lastUserMessage
    ? handleCommand(lastUserText)
    : null;

  if (commandResponse && !parsedImage && selectedMode !== "agent") {
    return createLocalUIMessageResponse(commandResponse);
  }

  const responseLength =
    selectedModel === "pro"
      ? "Użytkownik wybrał tryb dokładniejszy, ale nadal trzymaj odpowiedź do 220 słów."
      : "Użytkownik wybrał tryb tani/krótki, trzymaj odpowiedź do 120 słów.";

  const shouldUseWebTools = selectedMode === "search";
  const prioritizeKnowledge = shouldPrioritizeKnowledgeSearch(lastUserText);
  const shouldUseWeather = shouldUseWeatherTool(lastUserText);
  const forcedFirstMainTool:
    | "searchKnowledge"
    | "getWeather"
    | "google_search"
    | null = prioritizeKnowledge
    ? "searchKnowledge"
    : shouldUseWeather
      ? "getWeather"
      : shouldUseWebTools
        ? "google_search"
        : null;
  const detectedUserName = lastUserMessage
    ? getNameFromIntroduction(lastUserText)
    : null;

  if (detectedUserName) {
    await saveDetectedUserName(userId, detectedUserName, profileSupabase);
  }

  const storedUserProfile = await getStoredUserProfile(userId, profileSupabase);
  const personalizationPrompt = createPersonalizationPrompt(storedUserProfile);
  const personalizationTools = createPersonalizationTools(userId, profileSupabase);
  const modeWebInstructions = shouldUseWebTools
    ? webInstructions
    : "W tym trybie nie uzywaj internetu. Jesli uzytkownik prosi o najnowsze informacje, odpowiedz ostroznie i zaproponuj tryb Szukaj albo Agent do weryfikacji aktualnych zrodel.";

  try {
    if (selectedMode === "agent") {
      const allAgentTools = createAgentTools(selectedModel);
      const requestAgentTools = {
        ...(prioritizeKnowledge
          ? {
              ...knowledgeTools,
              calculator: allAgentTools.calculator,
              currentDateTime: allAgentTools.currentDateTime,
              generateImage: allAgentTools.generateImage,
            }
          : allAgentTools),
        ...personalizationTools,
      };

      const result = streamText({
        maxOutputTokens: selectedModel === "pro" ? 2600 : 1900,
        maxRetries: 0,
        messages: await createModelMessages(
          recentMessages,
          parsedImage,
          requestAgentTools,
        ),
        model: google(googleModelIds[selectedModel]),
        prepareStep: prioritizeKnowledge
          ? ({ stepNumber }) =>
              stepNumber === 0
                ? {
                    toolChoice: {
                      toolName: "searchKnowledge" as const,
                      type: "tool" as const,
                    },
                  }
                : {}
          : undefined,
        stopWhen: isStepCount(7),
        system: `${systemPrompts.agent}

${analyzerInstructions}

${webInstructions}

${knowledgeInstructions}

${generalToolsInstructions}

${responseFormatInstructions}

${parsedImage ? imageInstructions : ""}

${personalizationPrompt}

${responseLength}`,
        temperature: 0.25,
        timeout: {
          totalMs: 60000,
        },
        tools: requestAgentTools,
      });

      return result.toUIMessageStreamResponse({
        onError: (error) => getModelErrorMessage(error, selectedModel),
      });
    }

    const requestTools = {
      ...reactTools,
      ...knowledgeTools,
      ...personalizationTools,
    };

    const result = await generateText({
      model: google(googleModelIds[selectedModel]),
      maxRetries: 0,
      maxOutputTokens: selectedModel === "pro" ? 2200 : 1600,
      prepareStep: forcedFirstMainTool
        ? ({ stepNumber }) =>
            stepNumber === 0
              ? {
                  toolChoice: {
                    toolName: forcedFirstMainTool,
                    type: "tool" as const,
                  },
                }
              : {}
        : undefined,
      stopWhen: isStepCount(4),
      temperature: 0.2,
      timeout: {
        totalMs: 45000,
      },
      tools: requestTools,
      system: `${systemPrompts[selectedMode]}

${stabilityInstructions}

${modeWebInstructions}

${knowledgeInstructions}

${generalToolsInstructions}

${responseFormatInstructions}

${parsedImage ? imageInstructions : ""}

${personalizationPrompt}

${responseLength}`,
      messages: await createModelMessages(
        recentMessages,
        parsedImage,
        requestTools,
      ),
    });

    if (didKnowledgeSearchReturnNoResults(result.toolResults)) {
      return createLocalUIMessageResponse(
        "Nie mam informacji na ten temat w mojej bazie wiedzy. Skontaktuj się z firmą bezpośrednio.",
      );
    }

    return createLocalUIMessageResponse(appendSources(result.text, result.sources));
  } catch (error) {
    return createLocalUIMessageResponse(
      getModelErrorMessage(error, selectedModel),
    );
  }
}
