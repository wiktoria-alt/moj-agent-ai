"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { supabase } from "../../lib/supabase";

type DashboardData = {
  stats: { users: number; conversations: number; tokensToday: number; costToday: number };
  days: { date: string; tokens: number; conversations: number }[];
  endpoints: { endpoint: string; tokens: number }[];
  recent: { id: string; email: string; title: string; updatedAt: string; messages: number }[];
  pricing: { input: number; output: number };
};

const number = new Intl.NumberFormat("pl-PL");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4 });
const shortDate = new Intl.DateTimeFormat("pl-PL", { weekday: "short" });
const fullDate = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" });
const pieColors = ["#8b5cf6", "#38bdf8", "#22c55e", "#f59e0b", "#f43f5e", "#64748b"];

function UsageNav() {
  return <nav className="usage-nav" aria-label="Nawigacja admina">
    <a className="usage-nav-brand" href="/">
      <span aria-hidden="true">⚡</span>
      <strong>Agent AI</strong>
    </a>
    <div>
      <a href="/">Dashboard</a>
      <a href="/chat">Chat</a>
      <a href="/history">Historia</a>
      <a aria-current="page" href="/admin/dashboard">Użycie</a>
      <ThemeToggle />
      <button onClick={() => void supabase.auth.signOut().then(() => { window.location.href = "/login"; })} type="button">Wyloguj</button>
    </div>
  </nav>;
}

function LineChart({ values }: { values: DashboardData["days"] }) {
  const maximum = Math.max(...values.map((item) => item.tokens), 1);
  const points = values.map((item, index) => `${28 + index * 76},${170 - (item.tokens / maximum) * 132}`).join(" ");
  return <div className="usage-chart"><svg viewBox="0 0 512 205" role="img" aria-label="Tokeny w ostatnich siedmiu dniach"><line x1="28" y1="170" x2="484" y2="170" /><polyline points={points} />{values.map((item, index) => <g key={item.date}><circle cx={28 + index * 76} cy={170 - (item.tokens / maximum) * 132} r="5" /><text x={28 + index * 76} y="194">{shortDate.format(new Date(`${item.date}T12:00:00`))}</text></g>)}</svg></div>;
}

function BarChart({ values }: { values: DashboardData["days"] }) {
  const maximum = Math.max(...values.map((item) => item.conversations), 1);
  return <div className="usage-bars">{values.map((item) => <div className="usage-bar-column" key={item.date}><span>{item.conversations || ""}</span><i style={{ height: `${Math.max(4, (item.conversations / maximum) * 126)}px` }} /><small>{shortDate.format(new Date(`${item.date}T12:00:00`))}</small></div>)}</div>;
}

function EndpointChart({ values }: { values: DashboardData["endpoints"] }) {
  const visible = values.slice(0, 6);
  const total = visible.reduce((sum, item) => sum + item.tokens, 0) || 1;
  let position = 0;
  const stops = visible.map((item, index) => { const start = position; position += (item.tokens / total) * 100; return `${pieColors[index]} ${start}% ${position}%`; });
  return <div className="usage-pie-layout"><div className="usage-pie" style={{ background: `conic-gradient(${stops.length ? stops.join(",") : "#253047 0 100%"})` }}><span>{number.format(total)}<small>tokenów</small></span></div><div className="usage-legend">{visible.map((item, index) => <div key={item.endpoint}><i style={{ background: pieColors[index] }} /><span>{item.endpoint}</span><b>{Math.round((item.tokens / total) * 100)}%</b></div>)}</div></div>;
}

export default function UsageDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(async ({ data: sessionData }) => {
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Zaloguj się ponownie.");
      const response = await fetch("/api/admin/dashboard", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Nie udało się pobrać danych.");
      if (active) setData(payload);
    }).catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "Nie udało się pobrać danych."); });
    return () => { active = false; };
  }, []);

  return <main className="usage-shell">
    <UsageNav />
    <section className="usage-heading"><div><p>ADMIN · ANALITYKA</p><h1>📊 Dashboard użycia</h1><span>Rozmowy, użytkownicy, tokeny i szacowane koszty agenta.</span></div><div className="usage-live"><i /> Dane na żywo</div></section>
    {error && <p className="usage-error">{error}</p>}
    {!data && !error && <section className="usage-loading"><span /><p>Pobieram statystyki…</p></section>}
    {data && <>
      <section className="usage-stats" aria-label="Najważniejsze statystyki">
        <article><span>👥 Użytkownicy</span><strong>{number.format(data.stats.users)}</strong><small>Z aktywnymi rozmowami</small></article>
        <article><span>💬 Rozmowy</span><strong>{number.format(data.stats.conversations)}</strong><small>Łącznie w aplikacji</small></article>
        <article><span>🔤 Tokeny dziś</span><strong>{number.format(data.stats.tokensToday)}</strong><small>Input + output</small></article>
        <article className="usage-cost"><span>💰 Koszt dziś</span><strong>{money.format(data.stats.costToday)}</strong><small>Szacunek według stawek modelu</small></article>
      </section>
      <section className="usage-grid">
        <article className="usage-card usage-wide"><header><div><p>OSTATNIE 7 DNI</p><h2>Zużycie tokenów</h2></div><b>Trend dzienny</b></header><LineChart values={data.days} /></article>
        <article className="usage-card"><header><div><p>AKTYWNOŚĆ</p><h2>Rozmowy per dzień</h2></div></header><BarChart values={data.days} /></article>
        <article className="usage-card"><header><div><p>ŹRÓDŁA ZUŻYCIA</p><h2>Tokeny per endpoint</h2></div></header><EndpointChart values={data.endpoints} /></article>
        <article className="usage-card usage-table-card"><header><div><p>NAJNOWSZA AKTYWNOŚĆ</p><h2>Ostatnie rozmowy</h2></div><small>10 najnowszych</small></header><div className="usage-table-wrap"><table><thead><tr><th>Użytkownik</th><th>Tytuł</th><th>Data</th><th>Wiadomości</th></tr></thead><tbody>{data.recent.length ? data.recent.map((row) => <tr key={row.id}><td>{row.email}</td><td><b>{row.title}</b></td><td>{fullDate.format(new Date(row.updatedAt))}</td><td><span className="usage-message-count">{row.messages}</span></td></tr>) : <tr><td colSpan={4}>Brak zapisanych rozmów.</td></tr>}</tbody></table></div></article>
      </section>
      <p className="usage-pricing">Koszt orientacyjny: input ${data.pricing.input}/1M tokenów, output ${data.pricing.output}/1M tokenów.</p>
    </>}
  </main>;
}
