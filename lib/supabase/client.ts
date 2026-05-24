import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser-context Supabase client. Use only inside `"use client"`
 * components. Reads + writes cookies via `document.cookie` under the
 * hood, so middleware-set cookie scoping (`.meirverse.app`) is honoured.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
