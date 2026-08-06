import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

const features = [
  {
    icon: "⚖️",
    title: "Wstępna ocena SKD",
    text: "Prowadzi użytkownika przez pytania o umowę, spłatę, koszty, RRSO i terminy.",
  },
  {
    icon: "📄",
    title: "Analiza dokumentów",
    text: "Korzysta z bazy wiedzy i dokumentów użytkownika, aby wskazać możliwe czerwone flagi.",
  },
  {
    icon: "🧮",
    title: "Szacunek korzyści",
    text: "Pomaga policzyć, jakie koszty kredytu mogą mieć znaczenie przy analizie sankcji.",
  },
  {
    icon: "✍️",
    title: "Pisma i checklisty",
    text: "Pomaga przygotować szkic oświadczenia, reklamacji i listę dokumentów do sprawdzenia.",
  },
];

export function LandingPage() {
  return (
    <main className="landing-page">
      <div className="landing-glow landing-glow-one" />
      <div className="landing-glow landing-glow-two" />

      <nav className="landing-nav" aria-label="Główna nawigacja">
        <Link className="landing-brand" href="/">
          <span aria-hidden="true">⚖️</span>
          <strong>Agent SKD</strong>
        </Link>
        <div className="landing-nav-actions">
          <ThemeToggle />
          <Link className="landing-login" href="/login">
            Zaloguj się
          </Link>
        </div>
      </nav>

      <section className="landing-hero">
        <p className="landing-badge">
          <span aria-hidden="true">⚖️</span> Ekspert AI od sankcji kredytu darmowego
        </p>
        <h1>
          Sprawdź, czy Twoja umowa może mieć <em>potencjał SKD</em>.
        </h1>
        <p className="landing-lead">
          Agent SKD pomaga przejść przez pierwszą analizę kredytu konsumenckiego:
          dokumenty, terminy, koszty, możliwe naruszenia i kolejne kroki.
        </p>
        <div className="landing-actions">
          <Link className="landing-primary" href="/login">
            Zacznij za darmo <span aria-hidden="true">→</span>
          </Link>
          <a className="landing-secondary" href="#demo">
            Zobacz, jak działa <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="landing-note">
          Wstępna analiza · Checklista dokumentów · Szkice pism · Bez obietnic wygranej
        </p>
      </section>

      <section className="landing-demo" id="demo" aria-label="Podgląd działania agenta SKD">
        <div className="demo-topbar">
          <span />
          <span />
          <span />
          <p>agent-skd.app</p>
          <b>● Online</b>
        </div>
        <div className="demo-body">
          <aside>
            <div className="demo-logo">⚖️</div>
            <span>Nowa analiza</span>
            <span>📚 Baza wiedzy SKD</span>
            <span>🧮 Kalkulator</span>
            <i />
            <small>Bezpieczna przestrzeń</small>
          </aside>
          <article>
            <p className="demo-kicker">Asystent SKD</p>
            <h2>Dzień dobry 👋</h2>
            <div className="demo-question">
              Mam umowę kredytu gotówkowego. Od czego zacząć analizę SKD?
            </div>
            <div className="demo-answer">
              <span>⚖️</span>
              <p>
                Zacznijmy od 5 rzeczy: data umowy, kwota kredytu, status spłaty,
                RRSO, prowizja i formularz informacyjny. Potem sprawdzę możliwe
                czerwone flagi i przygotuję checklistę dokumentów.
                <br />
                <a href="#demo">Zobacz przykładową analizę →</a>
              </p>
            </div>
            <div className="demo-input">
              Opisz swoją umowę albo dodaj PDF... <b>↑</b>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-features" aria-label="Funkcje">
        {features.map((feature) => (
          <article key={feature.title}>
            <span>{feature.icon}</span>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        ))}
      </section>

      <section className="landing-final-cta">
        <p>Chcesz sprawdzić umowę spokojnie, krok po kroku?</p>
        <h2>Zacznij od bezpłatnej wstępnej analizy.</h2>
        <Link className="landing-primary" href="/login">
          Zacznij za darmo <span aria-hidden="true">→</span>
        </Link>
      </section>

      <footer className="landing-footer">
        <span>© 2026 Agent SKD</span>
        <span>Asystent wspiera analizę, ale nie zastępuje indywidualnej porady prawnej.</span>
      </footer>
    </main>
  );
}
