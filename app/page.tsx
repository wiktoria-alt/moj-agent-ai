"use client";

import { useEffect, useState } from "react";
import Dashboard from "./components/Dashboard";
import { LandingPage } from "./components/LandingPage";
import { supabase } from "./lib/supabase";

export default function HomePage() {
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setIsSignedIn(Boolean(data.user));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setIsSignedIn(Boolean(session?.user));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return isSignedIn ? <Dashboard /> : <LandingPage />;
}
