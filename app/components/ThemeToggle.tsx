"use client";

import { useEffect, useState } from "react";

const storageKey = "agent-ai-theme";

type Theme = "dark" | "light";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return window.localStorage.getItem(storageKey) === "light" ? "light" : "dark";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const savedTheme = getInitialTheme();
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(storageKey, nextTheme);
  }

  return (
    <button
      aria-label={theme === "dark" ? "Wlacz jasny motyw" : "Wlacz ciemny motyw"}
      className={`theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      title={theme === "dark" ? "Jasny motyw" : "Ciemny motyw"}
      type="button"
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
