"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, Suspense } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { GOOGLE_OAUTH_SCOPES } from "@/lib/google/scopes";

const errorMessages: Record<string, string> = {
  oauth_failed: "Google sign-in could not start. Please try again.",
  oauth_cancelled: "Sign-in was cancelled before completion.",
  domain_not_allowed:
    "Your email domain is not on the Meirverse allowlist. Contact Sebestian if you believe this is an error.",
  session_failed: "Could not establish a session. Please try again.",
  missing_code: "No authorisation code was returned by Google. Please try again.",
};

function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const error = params.get("error");
  const [signingIn, setSigningIn] = useState(false);

  const signInWithGoogle = async (skipHd: boolean) => {
    setSigningIn(true);
    const supabase = createSupabaseBrowserClient();
    const hd = process.env.NEXT_PUBLIC_GOOGLE_PRIMARY_WORKSPACE_HD;
    // access_type=offline + prompt=consent → Google issues a refresh
    // token (captured server-side in /auth/callback for Phase 2.4
    // Tasks/Calendar/Drive integrations).
    const queryParams: Record<string, string> = {
      access_type: "offline",
      prompt: "consent",
    };
    if (!skipHd && hd) queryParams.hd = hd;

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams,
        scopes: GOOGLE_OAUTH_SCOPES,
      },
    });
    if (signInError) {
      setSigningIn(false);
      router.push("/login?error=oauth_failed");
    }
    // On success the browser is redirected to Google by Supabase.
  };

  return (
    <div className="max-w-md w-full space-y-6">
      <div className="text-center space-y-2">
        <p className="font-sans text-xs uppercase tracking-[0.2em] text-muted">
          Meirverse Dashboard
        </p>
        <h1 className="font-serif text-3xl">Sign in</h1>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-4 py-3 font-sans text-sm text-red-900"
        >
          {errorMessages[error] ??
            "Unable to sign in. Please try again or contact Sebestian."}
        </div>
      )}

      <button
        type="button"
        onClick={() => signInWithGoogle(false)}
        disabled={signingIn}
        className="w-full rounded-md bg-ink text-paper px-4 py-3 font-sans text-sm hover:bg-accent disabled:opacity-50 transition-colors"
      >
        {signingIn ? "Redirecting…" : "Continue with Google"}
      </button>

      <button
        type="button"
        onClick={() => signInWithGoogle(true)}
        disabled={signingIn}
        className="block w-full text-center font-sans text-xs text-muted hover:text-ink transition-colors disabled:opacity-50"
      >
        Use a venture-tenant account →
      </button>

      <p className="text-center font-sans text-xs text-muted">
        Passkey sign-in arrives in Phase 2.2 Round 2.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-paper text-ink p-8">
      <Suspense
        fallback={
          <p className="font-sans text-sm text-muted">Loading sign-in…</p>
        }
      >
        <LoginInner />
      </Suspense>
    </main>
  );
}
