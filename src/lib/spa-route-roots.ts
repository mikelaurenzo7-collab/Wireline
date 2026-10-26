/**
 * First path segments the browser app can render a real page for, across the
 * public router (App.tsx) and the signed-in workspace (routes/AppRoutes.tsx).
 *
 * The production server still serves the app shell for every other path so
 * the visitor sees the friendly 404 page, but it answers with HTTP 404 instead
 * of 200. Search engines then stop indexing typo URLs as real pages.
 * tests/spa-route-roots.test.ts keeps this list in sync with both routers.
 */
export const SPA_ROUTE_ROOTS: ReadonlySet<string> = new Set([
  "404",
  "about",
  "accept-invite",
  "admin",
  "agents",
  "approvals",
  "apps",
  "audit",
  "auth",
  "billing",
  "blog",
  "calendar",
  "call-logs",
  "calls",
  "changelog",
  "compare",
  "computer",
  "connections",
  "contact",
  "developers",
  "dnc",
  "docs",
  "email",
  "features",
  "for",
  "get-started",
  "inbox",
  "insights",
  "knowledge",
  "legal",
  "login",
  "logs",
  "not-found",
  "oauth-complete",
  "onboarding",
  "overview",
  "phone",
  "pricing",
  "privacy",
  "reset",
  "reset-password",
  "security",
  "settings",
  "showcase",
  "signin",
  "signup",
  "sms-consent",
  "solutions",
  "studio",
  "support",
  "templates",
  "terms",
  "trust",
  "use-cases",
  "voice-permission",
  // Voice settings redirects into Studio (feat/xai-default-runtime-and-voice-clone).
  "voice",
  "voice-clone",
  "voices",
  "workspace",
]);

/** True when the SPA has a route for this path's first segment (or the home page). */
export function isKnownSpaRoute(pathname: string): boolean {
  const first = pathname.split("/").find(Boolean);
  return first === undefined || SPA_ROUTE_ROOTS.has(first.toLowerCase());
}
