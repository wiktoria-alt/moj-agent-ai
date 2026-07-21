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
  daysUntil: number;
  localName: string;
  name: string;
};

function getDaysUntil(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(`${date}T00:00:00`);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86400000));
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
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&timezone=Europe%2FWarsaw`,
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

async function getHolidays(): Promise<HolidayData[]> {
  const year = 2026;
  const response = await fetch(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/PL`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Nie udało się pobrać świąt z Nager.Date.");
  }

  const data = (await response.json()) as Array<{
    date: string;
    localName: string;
    name: string;
  }>;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return data
    .filter((holiday) => new Date(`${holiday.date}T00:00:00`) >= today)
    .map((holiday) => ({
      date: holiday.date,
      daysUntil: getDaysUntil(holiday.date),
      localName: holiday.localName,
      name: holiday.name,
    }))
    .slice(0, 4);
}

async function getRates() {
  return Promise.all([getExchangeRate("EUR"), getExchangeRate("USD")]);
}

export async function GET(request: Request) {
  const scope = new URL(request.url).searchParams.get("scope") || "all";

  try {
    if (scope === "weather") {
      return Response.json({ weather: await getWeather() });
    }

    if (scope === "rates") {
      return Response.json({
        currencyUpdatedAt: new Date().toISOString(),
        rates: await getRates(),
      });
    }

    if (scope === "holidays") {
      return Response.json({
        holidays: await getHolidays(),
        holidaysUpdatedAt: new Date().toISOString(),
      });
    }

    const [weather, rates, holidays] = await Promise.all([
      getWeather(),
      getRates(),
      getHolidays(),
    ]);

    return Response.json({
      currencyUpdatedAt: new Date().toISOString(),
      currentDateTime: new Date().toISOString(),
      holidays,
      holidaysUpdatedAt: new Date().toISOString(),
      rates,
      weather,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać danych dashboardu.",
      },
      { status: 502 },
    );
  }
}
