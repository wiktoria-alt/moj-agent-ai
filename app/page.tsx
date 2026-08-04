"use client";

import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import { LandingPage } from "./components/LandingPage";
import { supabase } from "./lib/supabase";

export default function HomePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setIsSignedIn(Boolean(data.user));
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setIsSignedIn(Boolean(session?.user));
      setIsLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return <main className="landing-loading" aria-label="Ładowanie strony" />;
  }

  return isSignedIn ? <Dashboard /> : <LandingPage />;
}
