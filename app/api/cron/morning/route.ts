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

function todayInPoland() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Warsaw",
    year: "numeric",
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

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Brakuje NEXT_PUBLIC_SUPABASE_URL lub klucza Supabase.");
  }

  return createClient(supabaseUrl, supabaseKey);
}

function isAuthorized(request: Request) {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const [weather, eur, usd, holiday] = await Promise.all([
      getWeather(),
      getExchangeRate("EUR"),
      getExchangeRate("USD"),
      getTodayHoliday(),
    ]);
    const date = todayInPoland();
    const currentDateTime = formatPolishDateTime();

    const { text } = await generateText({
      maxOutputTokens: 1800,
      maxRetries: 0,
      model: google("gemini-3.1-flash-lite"),
      prompt: `Dane wejściowe:
- Data i czas: ${currentDateTime}
- Pogoda w ${weather.city}: ${weather.temperature}°C, wilgotność ${weather.humidity}%, wiatr ${weather.windSpeed} km/h
- EUR: ${eur.mid} PLN (${eur.date})
- USD: ${usd.mid} PLN (${usd.date})
- Święto dzisiaj: ${holiday ? `${holiday.localName} (${holiday.name})` : "brak ustawowego święta w Polsce"}`,
      system: `Jesteś osobistym asystentem. Napisz poranny briefing w formacie:

# ☀️ Dzień dobry! Twój briefing na [data]

## 🌤️ Pogoda
[temperatura, opis, co ubrać]

## 💶 Kursy walut
- EUR: [kurs] PLN
- USD: [kurs] PLN

## 📅 Dzisiejszy dzień
- Dzień tygodnia: [...]
- Uwagi: [czy dziś święto? dzień wolny?]

## 💡 Porada dnia
[Krótka, pozytywna porada na dzień]`,
      temperature: 0.4,
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
