import {
  getStoredSignupIntent,
  getSignupWedgeRecommendation,
  parseSignupIntent,
  recommendedPlanFromIntent,
  type SignupIntent,
} from "./signup-intent";
import { clearFreshSignupSession, isFreshSignupSession } from "./post-signup-onboarding";

/** Legacy capability profile retained for account, billing, and migration compatibility. */
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

export function isMcpOAuthPath(value: string | null): value is string {
  return Boolean(value && isSafeInternalPath(value) && value.startsWith("/mcp/oauth/"));
}

export function isMcpOAuthRedirect(search: string): boolean {
  return isMcpOAuthPath(readRedirectFromSearch(search));
}

function isFreshSignupPreservedRedirect(value: string | null): value is string {
  return isMcpOAuthPath(value) || value === "/accept-invite";
}

export function persistAuthRedirect(value: string | null) {
  if (typeof window === "undefined") return;
  if (isSafeInternalPath(value)) window.localStorage.setItem(AUTH_REDIRECT_KEY, value);
  else window.localStorage.removeItem(AUTH_REDIRECT_KEY);
}

function returningPaidIntentDestination(search: string): string | null {
  const intent = parseSignupIntent(search);
  const plan = intent?.preferredPlanId;
  if (!plan || plan === "personal") return null;

  const params = new URLSearchParams({ plan });
  if (intent.preferredBillingInterval === "year") params.set("interval", "year");
  return `/settings/billing?${params.toString()}`;
}

/**
 * Preserve only the redirect requested by the OAuth flow that is starting now.
 * Paid-plan intent becomes a one-shot internal redirect; long-lived signup
 * attribution in localStorage never redirects an unrelated later sign-in.
 */
export function persistOAuthReturnFromSearch(search: string): void {
  persistAuthRedirect(readRedirectFromSearch(search) || returningPaidIntentDestination(search));
}

export function resolvePostAuthDestination(
  _workspaceMode: WorkspaceMode,
  search = typeof window !== "undefined" ? window.location.search : "",
): string {
  const freshSignup = isFreshSignupSession();
  const fromSearch = readRedirectFromSearch(search);
  if (fromSearch) {
    persistAuthRedirect(null);
    if (freshSignup) clearFreshSignupSession();
    return fromSearch;
  }

  if (!freshSignup) {
    const paidIntentDestination = returningPaidIntentDestination(search);
    if (paidIntentDestination) {
      persistAuthRedirect(null);
      return paidIntentDestination;
    }
  }

  if (freshSignup) {
    const storedMcpRedirect =
      typeof window !== "undefined" ? window.localStorage.getItem(AUTH_REDIRECT_KEY) : null;
    if (isFreshSignupPreservedRedirect(storedMcpRedirect)) {
      persistAuthRedirect(null);
      clearFreshSignupSession();
      return storedMcpRedirect;
    }
    persistAuthRedirect(null);
    clearFreshSignupSession();
    const currentIntent = parseSignupIntent(search);
    const storedIntent = getStoredSignupIntent();
    const template =
      currentIntent?.preferredTemplateId ||
      storedIntent?.preferredTemplateId ||
      getSignupWedgeRecommendation(currentIntent?.signupWedge || storedIntent?.signupWedge)
        ?.templateId;
    if (template) return `/studio?create=1&template=${encodeURIComponent(template)}`;
    return "/studio?create=1";
  }

  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(AUTH_REDIRECT_KEY);
    if (isSafeInternalPath(stored)) {
      window.localStorage.removeItem(AUTH_REDIRECT_KEY);
      return stored;
    }
  }

  return "/studio";
}
