/**
 * Microsoft Graph OAuth scopes requested at sign-in for the Phase 2.6
 * Microsoft 365 integrations.
 *
 * Order: identity + offline access first, then API scopes. Microsoft's
 * consent screen displays scopes in this order.
 *
 * `offline_access` is the Microsoft equivalent of Google's
 * `access_type=offline` — it triggers issuance of a refresh token, which
 * /auth/callback captures and stores encrypted in user_microsoft_tokens.
 * Without it, only the short-lived access token comes back and the
 * widgets can't refresh autonomously.
 *
 * To add a scope (e.g. Mail.Read later), append to the array AND add it
 * in Azure Portal → App Registration → API permissions. Users who signed
 * up before the new scope was added will be re-prompted on next sign-in.
 */

export const MICROSOFT_OAUTH_SCOPES = [
  // Identity + offline access (Microsoft refresh-token grant).
  "openid",
  "email",
  "profile",
  "offline_access",

  // Outlook Calendar — read-only.
  "https://graph.microsoft.com/Calendars.Read",

  // Microsoft To Do — read-only. (Tasks.ReadWrite if we later add the
  // "mark done" tick-box matching the Google Tasks widget.)
  "https://graph.microsoft.com/Tasks.Read",

  // OneDrive — read-only across personal drive + shared.
  "https://graph.microsoft.com/Files.Read.All",
].join(" ");
