"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser client. Only ever sees the anon key, and is bound by row-level security. */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
