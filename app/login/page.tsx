"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

function friendlyAuthMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("rate limit")) {
    return "Za dużo prób wysłania maila. Odczekaj chwilę i spróbuj ponownie.";
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid credentials")
  ) {
    return "Nieprawidłowy e-mail albo hasło. Jeśli nie masz konta, kliknij „Załóż konto”.";
  }

  if (normalized.includes("user already registered")) {
    return "Konto z tym e-mailem już istnieje. Przełącz na „Zaloguj się”.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Ten e-mail nie jest jeszcze potwierdzony. Sprawdź skrzynkę albo poproś o wyłączenie potwierdzania maila.";
  }

  if (normalized.includes("password")) {
    return "Hasło musi mieć minimum 6 znaków.";
  }

  return message || "Coś poszło nie tak. Spróbuj jeszcze raz.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const cleanEmail = email.trim().toLowerCase();
    const redirectTo =
      typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;

    const result = register
      ? await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: redirectTo },
        })
      : await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

    setLoading(false);

    if (result.error) {
      setMessage(friendlyAuthMessage(result.error.message));
      return;
    }

    if (register && !result.data.session) {
      setMessage(
        "Konto zostało utworzone. Jeśli aplikacja poprosi o potwierdzenie, sprawdź maila. Żeby logowanie było od razu, wyłącz potwierdzanie e-maila w ustawieniach logowania.",
      );
      return;
    }

    router.replace("/");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span aria-hidden="true">⚖️</span>
          <strong>Agent SKD</strong>
        </div>
        <p className="login-eyebrow">PROSTE LOGOWANIE</p>
        <h1>{register ? "Załóż konto" : "Witaj ponownie"}</h1>
        <p className="login-intro">
          {register
            ? "Wpisz e-mail i hasło. Konto ma działać prosto z poziomu strony — bez ręcznego dodawania użytkownika."
            : "Zaloguj się do swojego prywatnego asystenta od sankcji kredytu darmowego."}
        </p>
        <form className="login-form" onSubmit={submit}>
          <label>
            E-mail
            <input
              autoComplete="email"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="twoj@email.pl"
            />
          </label>
          <label>
            Hasło
            <input
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 znaków"
            />
          </label>
          <button className="login-submit" disabled={loading} type="submit">
            {loading ? "Proszę czekać..." : register ? "Utwórz konto" : "Zaloguj się"}
          </button>
        </form>
        {message && (
          <p className="login-message" role="status">
            {message}
          </p>
        )}
        <p className="login-switch">
          {register ? "Masz już konto?" : "Nie masz jeszcze konta?"}
          <button
            type="button"
            onClick={() => {
              setRegister(!register);
              setMessage("");
            }}
          >
            {register ? "Zaloguj się" : "Załóż konto"}
          </button>
        </p>
      </section>
    </main>
  );
}
