import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sign out the current session.
 *
 * POST-only — a stray <a href> can't accidentally (or maliciously) log
 * someone out. The dashboard header uses a small <form method="post">
 * around the button.
 */
export async function POST(request: NextRequest) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303, // 303 forces POST → GET on the redirect target
  });
}
