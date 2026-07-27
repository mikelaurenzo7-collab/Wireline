import { recommendedPlanFromIntent, type SignupIntent } from "./signup-intent";
import { clearFreshSignupSession, isFreshSignupSession } from "./post-signup-onboarding";

export type WorkspaceMode = "personal" | "business";

export const WORKSPACE_MODE_KEY = "wireline.mode";
export const AUTH_REDIRECT_KEY = "wireline.auth.redirect";

export function workspaceFromIntent(intent: SignupIntent | null | undefined): WorkspaceMode {
  const plan = intent ? recommendedPlanFromIntent(intent) : null;
  if (plan && plan !== "personal") return "business";
  if (intent?.signupWedge && intent.signupWedge !== "personal") return "business";
  return "personal";
}

export function readStoredWorkspaceMode(): WorkspaceMode {
  if (typeof window === "undefined") return "personal";
  const stored = window.localStorage.getItem(WORKSPACE_MODE_KEY);
  return stored === "personal" || stored === "business" ? stored : "personal";
}

export function persistWorkspaceMode(mode: WorkspaceMode) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_MODE_KEY, mode);
}

function isSafeInternalPath(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || codeUnit === 0x7f) return false;
  }

  try {
    const resolved = new URL(value, "https://wireline.invalid");
    if (resolved.origin !== "https://wireline.invalid") return false;
  } catch {
    return false;
  }

  return !/^\/auth\b|^\/signin\b|^\/login\b|^\/signup\b|^\/get-started\b|^\/reset\b/.test(value);
}

export function readRedirectFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("redirect");
  return isSafeInternalPath(value) ? value : null;
}

export function persistAuthRedirect(value: string | null) {
  if (typeof window === "undefined") return;
  if (isSafeInternalPath(value)) window.localStorage.setItem(AUTH_REDIRECT_KEY, value);
  else window.localStorage.removeItem(AUTH_REDIRECT_KEY);
}

export function resolvePostAuthDestination(
  workspaceMode: WorkspaceMode,
  search = typeof window !== "undefined" ? window.location.search : "",
): string {
  /**
   * Determines the route after successful login (email or OAuth).
   * Honors an explicit ?redirect first. Fresh signup then takes precedence over
   * any persisted redirect left by an earlier sign-in flow.
   * Otherwise:
   * - For immediate post-signup (fresh flag): Studio create (consumed after use).
   * - For returning sign-ins: persisted AUTH_REDIRECT_KEY (consumed after use).
   * - Default for all logged-in sessions: /overview (Home).
   * Studio is kept as the tool/create surface (nav, /studio, ?create=1 links).
   * Fresh signups can reach create in Studio when appropriate via links or the one-time flow.
   */
  const freshSignup = isFreshSignupSession();
  const fromSearch = readRedirectFromSearch(search);
  if (fromSearch) {
    persistAuthRedirect(null);
    if (freshSignup) clearFreshSignupSession();
    return fromSearch;
  }

  if (freshSignup) {
    // A redirect persisted by an earlier sign-in must never override a direct
    // signup. Only a safe redirect on the current signup URL may beat Fast Start.
    persistAuthRedirect(null);
    clearFreshSignupSession();
    return workspaceMode === "business" ? "/studio?create=1&posture=business" : "/studio?create=1";
  }

  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(AUTH_REDIRECT_KEY);
    if (isSafeInternalPath(stored)) {
      window.localStorage.removeItem(AUTH_REDIRECT_KEY);
      return stored;
    }
  }

  return "/overview";
}
