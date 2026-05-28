"use client";

/**
 * Global error boundary — catches React render errors at the root layout
 * level (where app/error.tsx cannot reach, because the error is in the
 * layout itself). Reports to Sentry per Platform Mandate §Observability,
 * then renders a minimal standalone document (this component replaces the
 * root layout, so it must supply its own <html>/<body>).
 */

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h2 style={{ fontWeight: 600 }}>Something went wrong.</h2>
          <p style={{ color: "#666" }}>
            The error has been logged. Please reload the page.
          </p>
        </div>
      </body>
    </html>
  );
}
