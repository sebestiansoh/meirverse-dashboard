// INTENTIONALLY EMPTY — Keep gadget was attempted on 2026-05-27 and
// reverted because the Google Keep API uses service-account domain-wide
// delegation only; it does NOT support end-user OAuth consent like
// Tasks / Calendar / Drive do.
//
// See docs/gadget-pattern.md → "APIs considered but not gadget-able"
// for the full rationale. If we later want Keep on the dashboard, the
// path is DWD with a service account — that's a different scaffold,
// not a Gadget.
//
// Safe to `rm` this file. Left as a 13-line stub so the rationale
// survives in the repo for the next person who asks "why no Keep?".

export {};
