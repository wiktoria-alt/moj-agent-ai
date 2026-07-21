import { google } from "@ai-sdk/google";
import { generateText, jsonSchema, tool } from "ai";

type CalculatorInput = {
  expression: string;
};

type CalculatorOutput = {
  error?: string;
  expression: string;
  result?: number;
};

type CurrentDateTimeInput = Record<string, never>;

type CurrentDateTimeOutput = {
  dateTime: string;
  dayOfWeek: string;
  timestamp: string;
};

type GetWeatherInput = {
  city: string;
};

type WeatherOutput = {
  city: string;
  description?: string;
  error?: string;
  humidity?: number;
  source?: string;
  temperature?: number;
  windSpeed?: number;
};

type GetExchangeRateInput = {
  currency: string;
};

type ExchangeRateOutput = {
  currency: string;
  date?: string;
  error?: string;
  rate?: number;
  source?: string;
};

type GetHolidaysInput = {
  countryCode: string;
  year: number;
};

type PublicHoliday = {
  date: string;
  localName: string;
  name: string;
};

type HolidaysOutput = {
  countryCode: string;
  error?: string;
  holidays?: PublicHoliday[];
  source?: string;
  year: number;
};

type SearchWikipediaInput = {
  query: string;
};

type WikipediaOutput = {
  error?: string;
  summary?: string;
  thumbnail?: string;
  title?: string;
  url?: string;
};

type SuggestAttractionsInput = {
  city: string;
  interests?: string;
};

type AttractionSuggestion = {
  description: string;
  title: string;
  url: string;
};

type SuggestAttractionsOutput = {
  attractions?: AttractionSuggestion[];
  city: string;
  error?: string;
  source?: string;
};

type SaveNoteInput = {
  content: string;
  title: string;
};

type NoteRecord = {
  content: string;
  createdAt: string;
  title: string;
};

type SaveNoteOutput = {
  saved: boolean;
  title: string;
};

type GetNotesInput = Record<string, never>;

type ReadWebPageInput = {
  url: string;
};

type GoogleSearchInput = {
  query: string;
};

type GoogleSearchOutput = {
  answer?: string;
  error?: string;
  query: string;
  source?: string;
  sources?: Array<{
    title: string;
    url: string;
  }>;
};

type GeocodingResponse = {
  results?: Array<{
    country?: string;
    latitude: number;
    longitude: number;
    name: string;
  }>;
};

type OpenMeteoResponse = {
  current?: {
    relative_humidity_2m?: number;
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
};

type NbpResponse = {
  rates?: Array<{
    effectiveDate?: string;
    mid?: number;
  }>;
};

type WikipediaSummaryResponse = {
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
  extract?: string;
  thumbnail?: {
    source?: string;
  };
  title?: string;
};

type WikipediaSearchResponse = {
  query?: {
    search?: Array<{
      snippet?: string;
      title: string;
    }>;
  };
};

type JsonFetchResult<T> =
  | {
      data: T;
      ok: true;
      status: number;
    }
  | {
      error: string;
      ok: false;
      status: number;
    };

const weatherDescriptions: Record<number, string> = {
  0: "bezchmurnie",
  1: "przeważnie bezchmurnie",
  2: "częściowe zachmurzenie",
  3: "pochmurno",
  45: "mgła",
  48: "mgła osadzająca szadź",
  51: "lekka mżawka",
  53: "umiarkowana mżawka",
  55: "gęsta mżawka",
  61: "lekki deszcz",
  63: "umiarkowany deszcz",
  65: "silny deszcz",
  71: "lekki śnieg",
  73: "umiarkowany śnieg",
  75: "silny śnieg",
  80: "przelotny lekki deszcz",
  81: "przelotny umiarkowany deszcz",
  82: "gwałtowne opady deszczu",
  95: "burza",
  96: "burza z lekkim gradem",
  99: "burza z silnym gradem",
};

const globalNotes = globalThis as typeof globalThis & {
  __reactAgentNotes?: NoteRecord[];
};

function getConnectionError(error: unknown) {
  if (error instanceof Error && error.name === "AbortError") {
    return "Timeout — serwer nie odpowiedział w 5 sekund. Spróbuj ponownie.";
  }

  if (error instanceof Error) {
    return `Błąd połączenia: ${error.message}`;
  }

  return "Błąd połączenia: nie udało się pobrać danych.";
}

async function fetchJson<T>(url: string): Promise<JsonFetchResult<T>> {
  let lastError = "Błąd połączenia: nie udało się pobrać danych.";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "MartaReActAgent/1.0",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const statusError = `API zwróciło błąd ${response.status}. Sprawdź parametry.`;

        if (response.status < 500 || attempt === 1) {
          return {
            error: statusError,
            ok: false,
            status: response.status,
          };
        }

        lastError = statusError;
        continue;
      }

      return {
        data: (await response.json()) as T,
        ok: true,
        status: response.status,
      };
    } catch (error) {
      lastError = getConnectionError(error);

      if (attempt === 1) {
        return {
          error: lastError,
          ok: false,
          status: 0,
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    error: lastError,
    ok: false,
    status: 0,
  };
}

async function fetchTextWithTimeout(url: string) {
  let lastError = "Błąd połączenia: nie udało się pobrać danych.";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MartaReActAgent/1.0)",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const statusError = `API zwróciło błąd ${response.status}. Sprawdź parametry.`;

        if (response.status < 500 || attempt === 1) {
          return {
            error: statusError,
            ok: false as const,
          };
        }

        lastError = statusError;
        continue;
      }

      return {
        ok: true as const,
        text: await response.text(),
      };
    } catch (error) {
      lastError = getConnectionError(error);

      if (attempt === 1) {
        return {
          error: lastError,
          ok: false as const,
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    error: lastError,
    ok: false as const,
  };
}

function getNotesStore() {
  globalNotes.__reactAgentNotes ??= [];
  return globalNotes.__reactAgentNotes;
}

function calculateExpression(expression: string): CalculatorOutput {
  const normalized = expression
    .replace(/,/g, ".")
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");
  const blockedTokens =
    /\b(?:import|require|eval|process|fetch|globalThis|window|document|Function|constructor|prototype)\b/i;

  if (blockedTokens.test(expression) || !/^[\d+\-*/().\s]+$/.test(normalized)) {
    return {
      error: "Wyrażenie zawiera niedozwolone znaki.",
      expression,
    };
  }

  try {
    const value = Function(`"use strict"; return (${normalized});`)();

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Invalid result");
    }

    return {
      expression,
      result: Number(value.toFixed(6)),
    };
  } catch {
    return {
      error: `Nie mogę obliczyć: ${expression}`,
      expression,
    };
  }
}

function getCurrentDateTime(): CurrentDateTimeOutput {
  const now = new Date();

  return {
    dateTime: new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "full",
      timeStyle: "medium",
      timeZone: "Europe/Warsaw",
    }).format(now),
    dayOfWeek: new Intl.DateTimeFormat("pl-PL", {
      timeZone: "Europe/Warsaw",
      weekday: "long",
    }).format(now),
    timestamp: now.toISOString(),
  };
}

async function getWeather(city: string): Promise<WeatherOutput> {
  const trimmedCity = city.trim();

  if (!trimmedCity) {
    return {
      city,
      error: "Podaj nazwę miasta",
    };
  }

  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    trimmedCity,
  )}&count=1&language=pl`;
  const geocoding = await fetchJson<GeocodingResponse>(geoUrl);

  if (!geocoding.ok) {
    return {
      city: trimmedCity,
      error: geocoding.error,
    };
  }

  if (!geocoding.data.results?.[0]) {
    return {
      city: trimmedCity,
      error: `Nie znalazłem miasta ${trimmedCity}. Sprawdź pisownię.`,
    };
  }

  const place = geocoding.data.results[0];
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`;
  const weather = await fetchJson<OpenMeteoResponse>(weatherUrl);

  if (!weather.ok) {
    return {
      city: place.name,
      error: weather.error,
    };
  }

  if (!weather.data.current) {
    return {
      city: place.name,
      error: `Nie udało się pobrać pogody dla miasta ${place.name}.`,
    };
  }

  const current = weather.data.current;
  const code = current.weather_code;

  return {
    city: place.country ? `${place.name}, ${place.country}` : place.name,
    description:
      typeof code === "number"
        ? weatherDescriptions[code] ?? `kod pogody ${code}`
        : "brak opisu",
    humidity: current.relative_humidity_2m,
    source: "Open-Meteo",
    temperature: current.temperature_2m,
    windSpeed: current.wind_speed_10m,
  };
}

async function getExchangeRate(currency: string): Promise<ExchangeRateOutput> {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!normalizedCurrency) {
    return {
      currency,
      error: "Podaj 3-literowy kod waluty (np. EUR, USD)",
    };
  }

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    return {
      currency: normalizedCurrency,
      error: "Podaj 3-literowy kod waluty (np. EUR, USD)",
    };
  }

  if (normalizedCurrency === "PLN") {
    return {
      currency: "PLN",
      date: new Date().toISOString().slice(0, 10),
      rate: 1,
      source: "PLN",
    };
  }

  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${encodeURIComponent(
    normalizedCurrency,
  )}/?format=json`;
  const data = await fetchJson<NbpResponse>(url);

  if (!data.ok) {
    return {
      currency: normalizedCurrency,
      error:
        data.status === 0
          ? data.error
          : `Waluta ${normalizedCurrency} nie jest w tabeli NBP. Popularne: EUR, USD, GBP, CHF.`,
    };
  }

  if (!data.data.rates?.[0]?.mid) {
    return {
      currency: normalizedCurrency,
      error: `Waluta ${normalizedCurrency} nie jest w tabeli NBP. Popularne: EUR, USD, GBP, CHF.`,
    };
  }

  return {
    currency: normalizedCurrency,
    date: data.data.rates[0].effectiveDate,
    rate: data.data.rates[0].mid,
    source: "NBP",
  };
}

async function getHolidays(
  countryCode: string,
  year: number,
): Promise<HolidaysOutput> {
  const normalizedCountryCode = countryCode.trim().toUpperCase();

  if (!normalizedCountryCode || !/^[A-Z]{2}$/.test(normalizedCountryCode)) {
    return {
      countryCode: normalizedCountryCode || countryCode,
      error: "Podaj 2-literowy kod kraju (np. PL, DE, US)",
      year,
    };
  }

  if (!Number.isInteger(year)) {
    return {
      countryCode: normalizedCountryCode,
      error: "Podaj poprawny rok, np. 2026.",
      year,
    };
  }

  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(
    normalizedCountryCode,
  )}`;
  const data = await fetchJson<PublicHoliday[]>(url);

  if (!data.ok) {
    return {
      countryCode: normalizedCountryCode,
      error:
        data.status === 0
          ? data.error
          : `Nie znalazłem świąt dla kraju ${normalizedCountryCode}. Popularne: PL, DE, US, GB, FR.`,
      year,
    };
  }

  return {
    countryCode: normalizedCountryCode,
    holidays: data.data.slice(0, 15).map((holiday) => ({
      date: holiday.date,
      localName: holiday.localName,
      name: holiday.name,
    })),
    source: "Nager.Date",
    year,
  };
}

async function searchWikipedia(query: string): Promise<WikipediaOutput> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      error: "Podaj hasło do wyszukania w Wikipedii.",
    };
  }

  const getSummary = (title: string) =>
    fetchJson<WikipediaSummaryResponse>(
      `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        title,
      )}`,
    );

  let summary = await getSummary(trimmedQuery);

  if (!summary.ok && summary.status === 404) {
    const search = await fetchJson<WikipediaSearchResponse>(
      `https://pl.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        trimmedQuery,
      )}&format=json&origin=*`,
    );
    if (!search.ok) {
      return {
        error: search.error,
      };
    }

    const firstTitle = search.data.query?.search?.[0]?.title;

    if (!firstTitle) {
      return {
        error: `Nie znalazłem artykułu w Wikipedii dla: ${trimmedQuery}.`,
      };
    }

    summary = await getSummary(firstTitle);
  }

  if (!summary.ok) {
    return {
      error:
        summary.status === 0
          ? summary.error
          : `Nie udało się pobrać streszczenia Wikipedii dla: ${trimmedQuery}.`,
    };
  }

  const pageTitle = summary.data.title ?? trimmedQuery;

  return {
    summary: (summary.data.extract ?? "").slice(0, 1000),
    thumbnail: summary.data.thumbnail?.source,
    title: pageTitle,
    url:
      summary.data.content_urls?.desktop?.page ??
      `https://pl.wikipedia.org/wiki/${encodeURIComponent(pageTitle)}`,
  };
}

async function suggestAttractions({
  city,
  interests,
}: SuggestAttractionsInput): Promise<SuggestAttractionsOutput> {
  const trimmedCity = city.trim();

  if (!trimmedCity) {
    return {
      city,
      error: "Podaj miasto, dla którego mam znaleźć atrakcje.",
    };
  }

  const searchPhrase = [trimmedCity, "atrakcje zabytki", interests?.trim()]
    .filter(Boolean)
    .join(" ");
  const result = await fetchJson<WikipediaSearchResponse>(
    `https://pl.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      searchPhrase,
    )}&srlimit=6&utf8=1&format=json&origin=*`,
  );

  if (!result.ok) {
    return { city: trimmedCity, error: result.error };
  }

  const attractions = (result.data.query?.search ?? []).map((item) => ({
    description: decodeHtmlEntities(item.snippet?.replace(/<[^>]+>/g, "") ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220),
    title: item.title,
    url: `https://pl.wikipedia.org/wiki/${encodeURIComponent(
      item.title.replace(/ /g, "_"),
    )}`,
  }));

  if (attractions.length === 0) {
    return {
      city: trimmedCity,
      error: `Nie znalazłam propozycji zwiedzania dla miasta ${trimmedCity}.`,
    };
  }

  return {
    attractions,
    city: trimmedCity,
    source: "Wikipedia",
  };
}

function saveNote({ content, title }: SaveNoteInput): SaveNoteOutput {
  const cleanTitle = title.trim() || "Notatka";
  const cleanContent = content.trim();
  const notes = getNotesStore();

  notes.push({
    content: cleanContent,
    createdAt: new Date().toISOString(),
    title: cleanTitle,
  });

  return {
    saved: true,
    title: cleanTitle,
  };
}

function getNotes(): NoteRecord[] {
  return [...getNotesStore()];
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

  const response = await fetchTextWithTimeout(parsedUrl.toString());

  if (!response.ok) {
    return response.error;
  }

  const text = extractTextFromHtml(response.text).slice(0, 3500);

  if (!text) {
    return "Nie udało się przeczytać strony: nie znaleziono czytelnej treści tekstowej.";
  }

  return `Źródło: ${parsedUrl.toString()}\n\n${text}`;
}

async function runGoogleSearch(query: string): Promise<GoogleSearchOutput> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      error: "Podaj frazę do wyszukania w Google.",
      query,
    };
  }

  try {
    const result = await generateText({
      maxOutputTokens: 1200,
      maxRetries: 0,
      model: google("gemini-2.5-flash"),
      prompt: trimmedQuery,
      system:
        "Wyszukaj aktualne informacje przez Google Search. Odpowiedz po polsku, zwięźle, podając najważniejsze fakty i źródła.",
      timeout: {
        totalMs: 45000,
      },
      tools: {
        google_search: google.tools.googleSearch({}),
      },
    });

    return {
      answer: result.text,
      query: trimmedQuery,
      source: "Google Search grounding",
      sources: result.sources
        .map((source) => ({
          title:
            "title" in source && typeof source.title === "string"
              ? source.title
              : "Źródło Google",
          url:
            "url" in source && typeof source.url === "string"
              ? source.url
              : "",
        }))
        .filter((source) => source.url)
        .slice(0, 6),
    };
  } catch {
    return {
      error: "Nie udało się wykonać wyszukiwania Google.",
      query: trimmedQuery,
    };
  }
}

export const reactTools = {
  calculator: tool<CalculatorInput, CalculatorOutput, {}>({
    description: "Oblicza wyrażenia matematyczne. Używaj do dokładnych obliczeń.",
    inputSchema: jsonSchema<CalculatorInput>({
      additionalProperties: false,
      properties: {
        expression: {
          description: "Wyrażenie matematyczne, np. 15 * 247 albo 5000 / 4.28.",
          type: "string",
        },
      },
      required: ["expression"],
      type: "object",
    }),
    execute: ({ expression }) => calculateExpression(expression),
  }),
  currentDateTime: tool<CurrentDateTimeInput, CurrentDateTimeOutput, {}>({
    description: "Zwraca aktualną datę i czas.",
    inputSchema: jsonSchema<CurrentDateTimeInput>({
      additionalProperties: false,
      properties: {},
      type: "object",
    }),
    execute: () => getCurrentDateTime(),
  }),
  getWeather: tool<GetWeatherInput, WeatherOutput, {}>({
    description: "Sprawdza aktualną pogodę w podanym mieście.",
    inputSchema: jsonSchema<GetWeatherInput>({
      additionalProperties: false,
      properties: {
        city: {
          description: "Nazwa miasta, np. Warszawa, Kraków albo Berlin.",
          type: "string",
        },
      },
      required: ["city"],
      type: "object",
    }),
    execute: ({ city }) => getWeather(city),
  }),
  getExchangeRate: tool<GetExchangeRateInput, ExchangeRateOutput, {}>({
    description: "Sprawdza kurs waluty do PLN z NBP.",
    inputSchema: jsonSchema<GetExchangeRateInput>({
      additionalProperties: false,
      properties: {
        currency: {
          description: "Kod waluty, np. EUR, USD, GBP albo CHF.",
          type: "string",
        },
      },
      required: ["currency"],
      type: "object",
    }),
    execute: ({ currency }) => getExchangeRate(currency),
  }),
  getHolidays: tool<GetHolidaysInput, HolidaysOutput, {}>({
    description: "Sprawdza święta państwowe w danym kraju na dany rok.",
    inputSchema: jsonSchema<GetHolidaysInput>({
      additionalProperties: false,
      properties: {
        countryCode: {
          description: "Kod kraju ISO 3166-1 alpha-2, np. PL, DE, FR.",
          type: "string",
        },
        year: {
          description: "Rok, np. 2026.",
          type: "number",
        },
      },
      required: ["countryCode", "year"],
      type: "object",
    }),
    execute: ({ countryCode, year }) => getHolidays(countryCode, year),
  }),
  searchWikipedia: tool<SearchWikipediaInput, WikipediaOutput, {}>({
    description: "Wyszukuje artykuł w polskiej Wikipedii i zwraca streszczenie.",
    inputSchema: jsonSchema<SearchWikipediaInput>({
      additionalProperties: false,
      properties: {
        query: {
          description: "Hasło albo temat do wyszukania.",
          type: "string",
        },
      },
      required: ["query"],
      type: "object",
    }),
    execute: ({ query }) => searchWikipedia(query),
  }),
  suggestAttractions: tool<
    SuggestAttractionsInput,
    SuggestAttractionsOutput,
    {}
  >({
    description:
      "Proponuje punkty do zwiedzenia w podanym mieście na podstawie Wikipedii. Używaj, gdy użytkownik pyta co zobaczyć, zwiedzić albo jakie atrakcje wybrać.",
    inputSchema: jsonSchema<SuggestAttractionsInput>({
      additionalProperties: false,
      properties: {
        city: {
          description: "Nazwa miasta, np. Kraków, Paryż albo Barcelona.",
          type: "string",
        },
        interests: {
          description:
            "Opcjonalne zainteresowania podróżnika, np. historia, sztuka, miejsca dla dzieci.",
          type: "string",
        },
      },
      required: ["city"],
      type: "object",
    }),
    execute: (input) => suggestAttractions(input),
  }),
  readWebPage: tool<ReadWebPageInput, string, {}>({
    description:
      "Pobiera i czyta zawartość strony internetowej. Używaj gdy użytkownik poda URL.",
    inputSchema: jsonSchema<ReadWebPageInput>({
      additionalProperties: false,
      properties: {
        url: {
          description: "Pełny adres URL strony internetowej.",
          type: "string",
        },
      },
      required: ["url"],
      type: "object",
    }),
    execute: ({ url }) => readWebPage(url),
  }),
  saveNote: tool<SaveNoteInput, SaveNoteOutput, {}>({
    description: "Zapisuje notatkę w pamięci agenta.",
    inputSchema: jsonSchema<SaveNoteInput>({
      additionalProperties: false,
      properties: {
        content: {
          description: "Treść notatki do zapamiętania.",
          type: "string",
        },
        title: {
          description: "Krótki tytuł notatki.",
          type: "string",
        },
      },
      required: ["title", "content"],
      type: "object",
    }),
    execute: (input) => saveNote(input),
  }),
  getNotes: tool<GetNotesInput, NoteRecord[], {}>({
    description: "Pobiera wszystkie zapisane notatki.",
    inputSchema: jsonSchema<GetNotesInput>({
      additionalProperties: false,
      properties: {},
      type: "object",
    }),
    execute: () => getNotes(),
  }),
  google_search: tool<GoogleSearchInput, GoogleSearchOutput, {}>({
    description:
      "Wyszukuje aktualne informacje przez Google Search grounding i zwraca krótkie streszczenie ze źródłami.",
    inputSchema: jsonSchema<GoogleSearchInput>({
      additionalProperties: false,
      properties: {
        query: {
          description: "Fraza do wyszukania w Google.",
          type: "string",
        },
      },
      required: ["query"],
      type: "object",
    }),
    execute: ({ query }) => runGoogleSearch(query),
  }),
};
