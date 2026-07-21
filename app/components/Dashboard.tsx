"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TopNavigation } from "./TopNavigation";

type WeatherData = {
  city: string;
  temperature: number;
  windSpeed: number;
  humidity: number;
  updatedAt: Date;
};

type RateData = {
  code: "EUR" | "USD";
  date: string;
  mid: number;
  delta: number | null;
};

type HolidayData = {
  date: string;
  localName: string;
  name: string;
  daysUntil: number;
};

type DashboardData = {
  weather: WeatherData | null;
  rates: RateData[];
  holidays: HolidayData[];
  currencyUpdatedAt: Date | null;
  holidaysUpdatedAt: Date | null;
  currentDateTime: Date | null;
};

type WeatherPayload = Omit<WeatherData, "updatedAt"> & {
  updatedAt: string;
};

type DashboardPayload = {
  currencyUpdatedAt: string;
  currentDateTime: string;
  holidays: HolidayData[];
  holidaysUpdatedAt: string;
  rates: RateData[];
  weather: WeatherPayload;
};

const initialData: DashboardData = {
  weather: null,
  rates: [],
  holidays: [],
  currencyUpdatedAt: null,
  holidaysUpdatedAt: null,
  currentDateTime: null,
};

const formatter = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "full",
  timeStyle: "short",
});

const timeFormatter = new Intl.DateTimeFormat("pl-PL", {
  hour: "2-digit",
  minute: "2-digit",
});

const quickActions = [
  { href: "/travel", label: "Podróże" },
  { href: "/react", label: "ReAct" },
  { href: "/chat", label: "Chat" },
  { href: "/think", label: "Myślenie" },
  { href: "/generate", label: "Grafiki" },
  { href: "/fewshot", label: "Słownik" },
];

const featuredAttractions = [
  "Wawel i katedra",
  "Rynek Główny",
  "Kazimierz",
  "Fabryka Schindlera",
];

function formatUpdatedAt(date: Date | null) {
  return date ? timeFormatter.format(date) : "--:--";
}

async function fetchDashboardJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? "Nie udało się pobrać danych dashboardu.");
  }

  return data;
}

function parseWeather(weather: WeatherPayload): WeatherData {
  return {
    ...weather,
    updatedAt: new Date(weather.updatedAt),
  };
}

function parseDashboard(payload: DashboardPayload): DashboardData {
  return {
    currencyUpdatedAt: new Date(payload.currencyUpdatedAt),
    currentDateTime: new Date(payload.currentDateTime),
    holidays: payload.holidays,
    holidaysUpdatedAt: new Date(payload.holidaysUpdatedAt),
    rates: payload.rates,
    weather: parseWeather(payload.weather),
  };
}

async function fetchWeather(): Promise<WeatherData> {
  const data = await fetchDashboardJson<{ weather: WeatherPayload }>(
    "/api/dashboard?scope=weather",
  );
  return parseWeather(data.weather);
}

async function fetchRates() {
  const data = await fetchDashboardJson<{
    currencyUpdatedAt: string;
    rates: RateData[];
  }>("/api/dashboard?scope=rates");

  return {
    rates: data.rates,
    updatedAt: new Date(data.currencyUpdatedAt),
  };
}

async function fetchHolidays() {
  const data = await fetchDashboardJson<{
    holidays: HolidayData[];
    holidaysUpdatedAt: string;
  }>("/api/dashboard?scope=holidays");

  return {
    holidays: data.holidays,
    updatedAt: new Date(data.holidaysUpdatedAt),
  };
}

async function fetchAllDashboardData() {
  const payload = await fetchDashboardJson<DashboardPayload>("/api/dashboard");
  return parseDashboard(payload);
}

function CardSkeleton() {
  return (
    <div className="dashboard-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData>(initialData);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const nextHoliday = data.holidays[0];

  const loadWeather = useCallback(async () => {
    const weather = await fetchWeather();
    setData((current) => ({ ...current, weather }));
  }, []);

  const loadRates = useCallback(async () => {
    const { rates, updatedAt } = await fetchRates();
    setData((current) => ({
      ...current,
      currencyUpdatedAt: updatedAt,
      rates,
    }));
  }, []);

  const loadHolidays = useCallback(async () => {
    const { holidays, updatedAt } = await fetchHolidays();
    setData((current) => ({
      ...current,
      holidays,
      holidaysUpdatedAt: updatedAt,
    }));
  }, []);

  const loadAll = useCallback(async () => {
    setIsRefreshing(true);
    setError("");

    try {
      setData(await fetchAllDashboardData());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Nie udało się odświeżyć danych dashboardu.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();

    const weatherInterval = window.setInterval(() => {
      void loadWeather().catch(() => undefined);
    }, 15 * 60 * 1000);
    const currencyInterval = window.setInterval(() => {
      void loadRates().catch(() => undefined);
    }, 60 * 60 * 1000);
    const clockInterval = window.setInterval(() => {
      setData((current) => ({ ...current, currentDateTime: new Date() }));
    }, 60 * 1000);

    return () => {
      window.clearInterval(weatherInterval);
      window.clearInterval(currencyInterval);
      window.clearInterval(clockInterval);
    };
  }, [loadAll, loadRates, loadWeather]);

  const formattedDate = useMemo(
    () =>
      data.currentDateTime
        ? formatter.format(data.currentDateTime)
        : "Ładowanie daty...",
    [data.currentDateTime],
  );

  return (
    <main className="chat-shell dashboard-shell">
      <TopNavigation />

      <section className="dashboard-hero" aria-label="Dashboard">
        <div>
          <p className="eyebrow">Panel danych na żywo</p>
          <h1>Dashboard</h1>
          <p>Dzień dobry! Dziś: {formattedDate}</p>
        </div>

        <button
          className="dashboard-refresh"
          disabled={isRefreshing}
          onClick={() => void loadAll()}
          title="Odśwież dane"
          type="button"
        >
          <span aria-hidden="true">↻</span>
          <span>{isRefreshing ? "Odświeżam" : "Odśwież"}</span>
        </button>
      </section>

      {error && <p className="dashboard-error">{error}</p>}

      <section className="dashboard-grid" aria-label="Dane dashboardu">
        <article className="dashboard-card weather-card">
          <header>
            <div>
              <p>Pogoda</p>
              <h2>Warszawa</h2>
            </div>
            <span>Open-Meteo</span>
          </header>
          {isLoading || !data.weather ? (
            <CardSkeleton />
          ) : (
            <div className="dashboard-metrics">
              <strong>{data.weather.temperature.toFixed(1)}°C</strong>
              <dl>
                <div>
                  <dt>Wiatr</dt>
                  <dd>{data.weather.windSpeed.toFixed(1)} km/h</dd>
                </div>
                <div>
                  <dt>Wilgotność</dt>
                  <dd>{data.weather.humidity}%</dd>
                </div>
              </dl>
              <small>Ostatnia aktualizacja: {formatUpdatedAt(data.weather.updatedAt)}</small>
            </div>
          )}
        </article>

        <article className="dashboard-card currency-card">
          <header>
            <div>
              <p>Kursy walut</p>
              <h2>EUR / USD</h2>
            </div>
            <span>NBP</span>
          </header>
          {isLoading || data.rates.length === 0 ? (
            <CardSkeleton />
          ) : (
            <div className="rate-list">
              {data.rates.map((rate) => (
                <div className="rate-row" key={rate.code}>
                  <span>{rate.code}</span>
                  <strong>{rate.mid.toFixed(4)} PLN</strong>
                  <em className={rate.delta && rate.delta >= 0 ? "up" : "down"}>
                    {rate.delta == null
                      ? "bez zmiany"
                      : `${rate.delta >= 0 ? "↑" : "↓"} ${Math.abs(rate.delta).toFixed(4)}`}
                  </em>
                  <small>{rate.date}</small>
                </div>
              ))}
              <small>Ostatnia aktualizacja: {formatUpdatedAt(data.currencyUpdatedAt)}</small>
            </div>
          )}
        </article>

        <article className="dashboard-card holidays-card">
          <header>
            <div>
              <p>Święta</p>
              <h2>Polska 2026</h2>
            </div>
            <span>Nager.Date</span>
          </header>
          {isLoading || data.holidays.length === 0 ? (
            <CardSkeleton />
          ) : (
            <div className="holiday-list">
              {nextHoliday && (
                <strong>
                  Najbliższe za {nextHoliday.daysUntil} dni: {nextHoliday.localName}
                </strong>
              )}
              {data.holidays.map((holiday) => (
                <div className="holiday-row" key={holiday.date}>
                  <span>{holiday.localName}</span>
                  <small>{holiday.date}</small>
                </div>
              ))}
              <small>Ostatnia aktualizacja: {formatUpdatedAt(data.holidaysUpdatedAt)}</small>
            </div>
          )}
        </article>

        <article className="dashboard-card quick-card">
          <header>
            <div>
              <p>Szybkie akcje</p>
              <h2>Przejdź do narzędzia</h2>
            </div>
            <span>Linki</span>
          </header>
          <div className="quick-actions">
            {quickActions.map((action) => (
              <a href={action.href} key={action.href}>
                {action.label}
              </a>
            ))}
          </div>
        </article>

        <article className="dashboard-card attractions-card">
          <header>
            <div>
              <p>Nowa funkcja podróży</p>
              <h2>Co zobaczyć w Krakowie?</h2>
            </div>
            <span>📍 Atrakcje</span>
          </header>
          <div className="dashboard-attractions">
            <ul>
              {featuredAttractions.map((attraction) => (
                <li key={attraction}>{attraction}</li>
              ))}
            </ul>
            <a href="/travel">Poproś Martę o plan zwiedzania →</a>
          </div>
        </article>
      </section>
    </main>
  );
}
