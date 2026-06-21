import {
  recommendedPlanFromIntent,
  type SignupIntent,
} from "./signup-intent";

export type WorkspaceMode = "personal" | "business";

export const WORKSPACE_MODE_KEY = "wireline.mode";
export const AUTH_REDIRECT_KEY = "wireline.auth.redirect";

export function workspaceFromIntent(intent: SignupIntent | null | undefined): WorkspaceMode {
  const plan = intent ? recommendedPlanFromIntent(intent) : null;
  if (plan === "business" || intent?.signupWedge === "business") return "business";
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
  return !/^\/auth\b|^\/signin\b|^\/login\b|^\/signup\b|^\/get-started\b|^\/reset\b/.test(
    value,
  );
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
  const fromSearch = readRedirectFromSearch(search);
  if (fromSearch) return fromSearch;
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(AUTH_REDIRECT_KEY);
    if (isSafeInternalPath(stored)) {
      window.localStorage.removeItem(AUTH_REDIRECT_KEY);
      return stored;
    }
  }
  return workspaceMode === "personal" ? "/app/personal" : "/app/business";
}
