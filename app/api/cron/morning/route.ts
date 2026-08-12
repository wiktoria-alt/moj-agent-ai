import { google } from "@ai-sdk/google";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";

export const maxDuration = 60;

type WeatherData = {
  city: string;
  humidity: number;
  temperature: number;
  updatedAt: string;
  windSpeed: number;
};

type RateData = {
  code: "EUR" | "USD";
  date: string;
  delta: number | null;
  mid: number;
};

type HolidayData = {
  date: string;
  localName: string;
  name: string;
};

type NewsItem = {
  source: string;
  title: string;
  url: string;
};

function todayInPoland() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Warsaw",
    year: "numeric",
  }).format(new Date());
}

function formatPolishDate() {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
    timeZone: "Europe/Warsaw",
  }).format(new Date());
}

function formatPolishDateTime() {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date());
}

async function getWeather(): Promise<WeatherData> {
  const geoResponse = await fetch(
    "https://geocoding-api.open-meteo.com/v1/search?name=Warszawa&count=1&language=pl&format=json",
    { cache: "no-store" },
  );

  if (!geoResponse.ok) {
    throw new Error("Nie udało się pobrać lokalizacji Warszawy.");
  }

  const geoData = (await geoResponse.json()) as {
    results?: Array<{ latitude: number; longitude: number; name: string }>;
  };
  const place = geoData.results?.[0];

  if (!place) {
    throw new Error("Nie znaleziono Warszawy w Open-Meteo.");
  }

  const weatherResponse = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&timezone=Europe%2FWarsaw`,
    { cache: "no-store" },
  );

  if (!weatherResponse.ok) {
    throw new Error("Nie udało się pobrać pogody z Open-Meteo.");
  }

  const weatherData = (await weatherResponse.json()) as {
    current?: {
      relative_humidity_2m?: number;
      temperature_2m?: number;
      wind_speed_10m?: number;
    };
  };

  return {
    city: place.name || "Warszawa",
    humidity: Math.round(weatherData.current?.relative_humidity_2m ?? 0),
    temperature: weatherData.current?.temperature_2m ?? 0,
    updatedAt: new Date().toISOString(),
    windSpeed: weatherData.current?.wind_speed_10m ?? 0,
  };
}

async function getExchangeRate(code: "EUR" | "USD"): Promise<RateData> {
  const response = await fetch(
    `https://api.nbp.pl/api/exchangerates/rates/a/${code}/last/2/?format=json`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać kursu ${code} z NBP.`);
  }

  const data = (await response.json()) as {
    rates: Array<{ effectiveDate: string; mid: number }>;
  };
  const previous = data.rates.at(-2);
  const latest = data.rates.at(-1);

  if (!latest) {
    throw new Error(`Brak kursu ${code} w odpowiedzi NBP.`);
  }

  return {
    code,
    date: latest.effectiveDate,
    delta: previous ? latest.mid - previous.mid : null,
    mid: latest.mid,
  };
}

async function getTodayHoliday(): Promise<HolidayData | null> {
  const year = new Date().getFullYear();
  const response = await fetch(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/PL`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    return null;
  }

  const holidays = (await response.json()) as HolidayData[];
  return holidays.find((holiday) => holiday.date === todayInPoland()) ?? null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function getNews(): Promise<NewsItem[]> {
  try {
    const response = await fetch(
      "https://news.google.com/rss/search?q=Polska%20biznes%20technologia&hl=pl&gl=PL&ceid=PL:pl",
      { cache: "no-store" },
    );

    if (!response.ok) {
      return [];
    }

    const xml = await response.text();
    const items = [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/g)]
      .slice(0, 5)
      .map((match) => {
        const title = decodeHtmlEntities(match[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
        const url = decodeHtmlEntities(match[2].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
        const [cleanTitle, source = "Google News"] = title.split(" - ").map((part) => part.trim());

        return {
          source,
          title: cleanTitle,
          url,
        };
      });

    return items;
  } catch {
    return [];
  }
}

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Brakuje NEXT_PUBLIC_SUPABASE_URL lub klucza Supabase.");
  }

  return createClient(supabaseUrl, supabaseKey);
}

function getSupabaseAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

async function isAuthorized(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const token = authHeader?.replace(/^Bearer\s+/i, "");
  const supabase = getSupabaseAuthClient();

  if (!token || !supabase) {
    return false;
  }

  const { data, error } = await supabase.auth.getUser(token);

  return !error && Boolean(data.user);
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const [weather, eur, usd, holiday, news] = await Promise.all([
      getWeather(),
      getExchangeRate("EUR"),
      getExchangeRate("USD"),
      getTodayHoliday(),
      getNews(),
    ]);
    const date = todayInPoland();
    const humanDate = formatPolishDate();
    const currentDateTime = formatPolishDateTime();
    const newsLines =
      news.length > 0
        ? news
            .map((item, index) => `${index + 1}. ${item.title} (${item.source}) - ${item.url}`)
            .join("\n")
        : "Nie udało się pobrać aktualnych nagłówków wiadomości.";

    const skdSystemPrompt = `Jesteś asystentem kancelaryjno-operacyjnym dla pracy z SKD, czyli sankcją kredytu darmowego.
Napisz poranny briefing po polsku. Ma być praktyczny, konkretny i pod sprawy klientów bez danych osobowych.

Użyj dokładnie tej daty w nagłówku: ${humanDate}. Nie przesuwaj daty na jutro.

Format odpowiedzi:

# Briefing SKD na ${humanDate}

## 1. Priorytety na dziś
Wypisz 3-5 zadań operacyjnych przy sprawach SKD.

## 2. Checklist dokumentów do spraw SKD
Tabela: Dokument | Po co jest potrzebny | Co sprawdzić.

## 3. Punkty SKD do kontroli w umowach
Tabela: Punkt ustawy | Co sprawdzić w umowie | Sygnał ryzyka | Co zapytać klienta.
Uwzględnij tylko: art. 30 ust. 1 pkt 7, pkt 10, pkt 15, pkt 16 ustawy o kredycie konsumenckim.

## 4. Alerty i ręczna weryfikacja
Krótka lista miejsc, w których agent nie powinien zgadywać i trzeba zajrzeć do PDF.

## 5. Pytania do klienta
5 krótkich pytań pomagających uzupełnić sprawę.

## 6. Mini-podsumowanie dla klienta
3-4 zdania prostym językiem, bez obietnicy wygranej.

## 7. Kontekst dnia
Jedno krótkie zdanie o pogodzie/logistyce i jedno o wiadomościach, tylko jeśli przydatne.`;

    const { text } = await generateText({
      maxOutputTokens: 2200,
      maxRetries: 0,
      model: google("gemini-3.1-flash-lite"),
      prompt: `Dane wejściowe:
- Data ISO do zapisu: ${date}
- Data do nagłówka: ${humanDate}
- Data i czas: ${currentDateTime}
- Pogoda w ${weather.city}: ${weather.temperature}°C, wilgotność ${weather.humidity}%, wiatr ${weather.windSpeed} km/h
- EUR: ${eur.mid} PLN (${eur.date})
- USD: ${usd.mid} PLN (${usd.date})
- Święto dzisiaj: ${holiday ? `${holiday.localName} (${holiday.name})` : "brak ustawowego święta w Polsce"}
- Najważniejsze wiadomości:
${newsLines}

WYMAGANY FORMAT SKD:
- Nie twórz zwykłego briefingu osobistego.
- Napisz briefing dla pracy z sankcją kredytu darmowego.
- Uwzględnij: dokumenty klienta, checklistę umowy, art. 30 ust. 1 pkt 7, 10, 15 i 16, pytania do klienta, zadania na dziś i krótkie podsumowanie dla klienta.
- Pogoda, waluty i ogólne wiadomości mogą być tylko krótkim kontekstem na końcu.
- Nie używaj danych osobowych.`,
      system: skdSystemPrompt + `

Stary format poniżej traktuj tylko jako informację pomocniczą, jeśli model go widzi.
Jesteś osobistym asystentem. Napisz poranny briefing po polsku.

Użyj dokładnie tej daty w nagłówku: ${humanDate}. Nie przesuwaj daty na jutro.

Format:

# ☀️ Dzień dobry! Twój briefing na ${humanDate}

## 🌤️ Pogoda
[temperatura, opis, co ubrać]

## 💶 Kursy walut
- EUR: [kurs] PLN
- USD: [kurs] PLN

## 📰 Najważniejsze wiadomości
[3-5 krótkich punktów na podstawie przekazanych nagłówków]

## 📅 Dzisiejszy dzień
- Dzień tygodnia: [...]
- Uwagi: [czy dziś święto? dzień wolny?]

## 💡 Porada dnia
[Krótka, pozytywna porada na dzień]`,
      temperature: 0.35,
    });

    const supabase = getSupabaseClient();
    const { error } = await supabase.from("briefings").insert({
      content: text,
      date,
    });

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      date,
      preview: text.slice(0, 240),
      success: true,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się wygenerować morning briefingu.",
        success: false,
      },
      { status: 500 },
    );
  }
}
