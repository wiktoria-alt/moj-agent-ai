"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type NavLink = {
  href: string;
  label: string;
  main?: boolean;
  match?: readonly string[];
};

const links: NavLink[] = [
  { href: "/", label: "🏠 Dashboard", main: true, match: ["/", "/dashboard"] },
  { href: "/chat", label: "Chat" },
  { href: "/history", label: "📜 Historia", match: ["/history"] },
  { href: "/upload", label: "📚 Baza wiedzy" },
  { href: "/think", label: "Myślenie" },
  { href: "/fewshot", label: "Słownik" },
  { href: "/format", label: "Formater" },
  { href: "/search", label: "Szukaj" },
  { href: "/generate", label: "Grafiki" },
  { href: "/vision", label: "Vision" },
  { href: "/agent", label: "Agent" },
  { href: "/react", label: "ReAct" },
  { href: "/travel", label: "Podróże" },
  { href: "/extract", label: "Analizator" },
];

type TopNavigationProps = {
  className?: string;
};

export function TopNavigation({ className = "" }: TopNavigationProps) {
  const pathname = usePathname() || "/";
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <nav
      className={`top-nav ${className} ${isOpen ? "open" : ""}`.trim()}
      aria-label="Nawigacja"
    >
      <a className="nav-brand" href="/" aria-label="Agent AI — Centrum dowodzenia">
        <span className="nav-brand-icon" aria-hidden="true">⚡</span>
        <span className="nav-brand-copy">
          <strong>Agent AI</strong>
          <small>Centrum dowodzenia</small>
        </span>
      </a>

      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "Zamknij menu" : "Otwórz menu"}
        className="nav-toggle"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span aria-hidden="true">☰</span>
        <span>Menu</span>
      </button>

      <div className="top-nav-links">
        {links.map((link) => {
          const isActive = link.match
            ? link.match.some(
                (path) =>
                  pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)),
              )
            : pathname === link.href;
          const linkClass = [
            isActive ? "active" : "",
            link.main ? "primary" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <a
              className={linkClass || undefined}
              href={link.href}
              key={link.href}
              onClick={() => setIsOpen(false)}
            >
              {link.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
