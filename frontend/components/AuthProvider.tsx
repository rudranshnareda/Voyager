"use client";

import { useEffect } from "react";
import { setTokenGetter } from "@/lib/api";
import { createClient } from "@/lib/supabase";

const supabase = createClient();

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    setTokenGetter(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.access_token ?? null;
    });
  }, []);

  return <>{children}</>;
}
