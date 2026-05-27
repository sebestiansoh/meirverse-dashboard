/**
 * Google OAuth scopes requested at sign-in for Phase 2.4 integrations.
 *
 * Order: identity scopes first, then API scopes. Google's consent screen
 * shows scopes in this order; identity first is the conventional flow.
 *
 * To add a scope (e.g. Gmail later), append to the array and ALSO add
 * it in Google Cloud Console → Data Access. Users who signed up before
 * the new scope was added will be re-prompted on next sign-in.
 */

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  // NOTE: Keep was attempted on 2026-05-27 and reverted. The Keep API
  // is service-account-DWD-only and rejects end-user OAuth scope
  // requests as "invalid". See docs/gadget-pattern.md for the writeup.
].join(" ");
