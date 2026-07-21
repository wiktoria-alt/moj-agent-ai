"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

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
    const result = register
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (result.error) {
      setMessage(result.error.message);
      return;
    }
    if (register && !result.data.session) {
      setMessage("Sprawdź e-mail i potwierdź rejestrację.");
      return;
    }
    router.replace("/");
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand"><span aria-hidden="true">⚡</span><strong>Agent AI</strong></div>
        <p className="login-eyebrow">CENTRUM DOWODZENIA</p>
        <h1>{register ? "Załóż konto" : "Witaj ponownie"}</h1>
        <p className="login-intro">{register ? "Utwórz konto, aby korzystać z prywatnej przestrzeni rozmów." : "Zaloguj się, aby przejść do swojego prywatnego asystenta."}</p>
        <form className="login-form" onSubmit={submit}>
          <label>E-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="twoj@email.pl" /></label>
          <label>Hasło<input required minLength={6} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 6 znaków" /></label>
          <button className="login-submit" disabled={loading} type="submit">{loading ? "Proszę czekać..." : register ? "Utwórz konto" : "Zaloguj się"}</button>
        </form>
        {message && <p className="login-message" role="status">{message}</p>}
        <p className="login-switch">{register ? "Masz już konto?" : "Nie masz jeszcze konta?"}<button type="button" onClick={() => { setRegister(!register); setMessage(""); }}>{register ? "Zaloguj się" : "Załóż konto"}</button></p>
      </section>
    </main>
  );
}
