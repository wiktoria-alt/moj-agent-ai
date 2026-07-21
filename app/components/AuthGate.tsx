"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(pathname === "/login");

  useEffect(() => {
    if (pathname === "/login") {
      setReady(true);
      return;
    }
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (!data.user) router.replace("/login");
      else setReady(true);
    });
    return () => { active = false; };
  }, [pathname, router]);

  if (!ready) return <main className="history-page-loading"><p>Sprawdzam logowanie...</p></main>;
  return <>{children}</>;
}
