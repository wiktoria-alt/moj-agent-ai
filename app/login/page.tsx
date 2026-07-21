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
    event.preventDefault(); setLoading(true); setMessage("");
    const result = register
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (register && !result.data.session) { setMessage("Sprawdź e-mail i potwierdź rejestrację."); return; }
    router.replace("/");
  }
  return <main className="history-shell"><section className="history-empty"><h1>{register ? "Załóż konto" : "Zaloguj się"}</h1><form onSubmit={submit}><p><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" /></p><p><input required minLength={6} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Hasło (min. 6 znaków)" /></p><button className="history-start-link" disabled={loading} type="submit">{loading ? "Proszę czekać..." : register ? "Zarejestruj się" : "Zaloguj się"}</button></form>{message && <p className="history-error">{message}</p>}<button type="button" onClick={() => { setRegister(!register); setMessage(""); }}>{register ? "Mam już konto" : "Załóż konto"}</button></section></main>;
}
