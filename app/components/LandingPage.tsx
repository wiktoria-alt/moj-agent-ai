import Link from "next/link";

const features = [
  { icon: "🧠", title: "Pamięta rozmowy", text: "Wraca do ważnych ustaleń, kontekstu i Twojego stylu pracy." },
  { icon: "📚", title: "Zna Twoje dokumenty", text: "Odpowiada na podstawie prywatnej bazy wiedzy Twojej firmy." },
  { icon: "🔐", title: "Prywatność od podstaw", text: "Każde konto ma własną, oddzieloną przestrzeń danych." },
  { icon: "⚡", title: "Działa 24/7", text: "Automatyzuje briefing, monitoring i powtarzalne zadania." },
];

export function LandingPage() {
  return (
    <main className="landing-page">
      <div className="landing-glow landing-glow-one" />
      <div className="landing-glow landing-glow-two" />

      <nav className="landing-nav" aria-label="Główna nawigacja">
        <Link className="landing-brand" href="/">
          <span aria-hidden="true">✦</span>
          <strong>Agent AI</strong>
        </Link>
        <Link className="landing-login" href="/login">Zaloguj się</Link>
      </nav>

      <section className="landing-hero">
        <p className="landing-badge"><span aria-hidden="true">✦</span> Twój inteligentny zespół w jednym miejscu</p>
        <h1>Agent, który zamienia <em>wiedzę</em> w działanie.</h1>
        <p className="landing-lead">Agent AI zna dokumenty Twojej firmy, pamięta kontekst rozmów i pomaga podejmować trafniejsze decyzje — każdego dnia.</p>
        <div className="landing-actions">
          <Link className="landing-primary" href="/login">Zacznij za darmo <span aria-hidden="true">→</span></Link>
          <a className="landing-secondary" href="#demo">Zobacz, jak działa <span aria-hidden="true">↓</span></a>
        </div>
        <p className="landing-note">Bez karty płatniczej · Start w mniej niż 30 sekund</p>
      </section>

      <section className="landing-demo" id="demo" aria-label="Podgląd działania agenta">
        <div className="demo-topbar"><span /><span /><span /><p>agent-ai.app</p><b>● Online</b></div>
        <div className="demo-body">
          <aside>
            <div className="demo-logo">✦</div><span>Nowa rozmowa</span><span>📚 Baza wiedzy</span><span>📊 Raporty</span><i /> <small>Wiktoria K.</small>
          </aside>
          <article>
            <p className="demo-kicker">Asystent firmowy</p>
            <h2>Dzień dobry, Wiktoria 👋</h2>
            <div className="demo-question">Jak wygląda nasz aktualny cennik?</div>
            <div className="demo-answer"><span>✦</span><p>Znalazłem odpowiedź w dokumencie <b>„Cennik 2026”</b>. Pakiet Pro kosztuje <b>249 zł miesięcznie</b> i obejmuje pełny dostęp dla 10 osób.<br /><a href="#demo">Zobacz źródło ↗</a></p></div>
            <div className="demo-input">Zapytaj o wszystko… <b>↑</b></div>
          </article>
        </div>
      </section>

      <section className="landing-features" aria-label="Funkcje">
        {features.map((feature) => <article key={feature.title}><span>{feature.icon}</span><h2>{feature.title}</h2><p>{feature.text}</p></article>)}
      </section>

      <section className="landing-final-cta">
        <p>Gotowy na spokojniejszą pracę?</p>
        <h2>Zacznij w 30 sekund.</h2>
        <Link className="landing-primary" href="/login">Stwórz konto za darmo <span aria-hidden="true">→</span></Link>
      </section>

      <footer className="landing-footer"><span>© 2026 Agent AI</span><span>Stworzony, aby odciążyć Twój zespół.</span></footer>
    </main>
  );
}
