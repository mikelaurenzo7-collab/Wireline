/**
 * Post-signup onboarding — first-session Fast Start orchestration.
 * Keeps Live Ops clean; wizard auto-opens once after account creation.
 */

import { authFetch } from "./api";
import {
  fetchFleetSetupProgress,
  isFleetSetupComplete,
  type FleetSetupProgress,
} from "./fleet-setup-progress";

export const FRESH_SIGNUP_SESSION_KEY = "wireline_fresh_signup";
export const POST_SIGNUP_FLOW_SESSION_KEY = "wireline_post_signup_flow";
export const POST_SIGNUP_DISMISS_KEY = "wireline_post_signup_dismissed";

export type UserPreferencesSnake = {
  tour_completed?: boolean;
  onboarding_completed?: boolean;
};

export async function fetchUserPreferences(): Promise<UserPreferencesSnake | null> {
  try {
    const res = await authFetch("/api/user-preferences");
    if (!res.ok) return null;
    return (await res.json()) as UserPreferencesSnake;
  } catch {
    return null;
  }
}

/** Setup onboarding finished — also marks console tour done (orientation lives in celebration UI). */
export async function markOnboardingCompleted(): Promise<void> {
  try {
    await authFetch("/api/user-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_completed: true, tour_completed: true }),
    });
  } catch {
    /* non-critical */
  }
}

/** Skip auto product tour without finishing fleet setup (explore-first path). */
export async function markTourCompleted(): Promise<void> {
  try {
    await authFetch("/api/user-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tour_completed: true }),
    });
  } catch {
    /* non-critical */
  }
}

export function markFreshSignupSession(): void {
  try {
    sessionStorage.setItem(FRESH_SIGNUP_SESSION_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function isFreshSignupSession(): boolean {
  try {
    return sessionStorage.getItem(FRESH_SIGNUP_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearFreshSignupSession(): void {
  try {
    sessionStorage.removeItem(FRESH_SIGNUP_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function setPostSignupFlowActive(active: boolean): void {
  try {
    if (active) sessionStorage.setItem(POST_SIGNUP_FLOW_SESSION_KEY, "active");
    else sessionStorage.removeItem(POST_SIGNUP_FLOW_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function isPostSignupFlowActive(): boolean {
  try {
    return sessionStorage.getItem(POST_SIGNUP_FLOW_SESSION_KEY) === "active";
  } catch {
    return false;
  }
}

export function markPostSignupDismissed(): void {
  try {
    localStorage.setItem(POST_SIGNUP_DISMISS_KEY, "true");
  } catch {
    /* ignore */
  }
}

export function isPostSignupDismissed(): boolean {
  try {
    return localStorage.getItem(POST_SIGNUP_DISMISS_KEY) === "true";
  } catch {
    return false;
  }
}

export function beginOnboardingTimer(): void {
  try {
    if (!localStorage.getItem("wireline_onboarding_start")) {
      localStorage.setItem("wireline_onboarding_start", Date.now().toString());
    }
  } catch {
    /* ignore */
  }
}

export function markOnboardingCelebrated(): void {
  try {
    localStorage.setItem("wireline_onboarding_celebrated", "true");
  } catch {
    /* ignore */
  }
}

export type PostSignupEligibility = {
  shouldShow: boolean;
  reason: "fresh_signup" | "incomplete_fleet" | null;
  progress: FleetSetupProgress | null;
  planId: string | null;
};

/** Whether to auto-open the welcome + Fast Start flow. */
export async function evaluatePostSignupEligibility(): Promise<PostSignupEligibility> {
  const [prefs, progress, planId] = await Promise.all([
    fetchUserPreferences(),
    fetchFleetSetupProgress().catch(() => null),
    authFetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d) =>
          (d?.subscription?.plan_id ||
            d?.subscription?.plan ||
            d?.signup_intent?.plan_id ||
            null) as string | null,
      )
      .catch(() => null),
  ]);

  if (prefs?.onboarding_completed) {
    clearFreshSignupSession();
    return { shouldShow: false, reason: null, progress, planId };
  }

  if (progress && isFleetSetupComplete(progress)) {
    await markOnboardingCompleted();
    markOnboardingCelebrated();
    clearFreshSignupSession();
    return { shouldShow: false, reason: null, progress, planId };
  }

  const isWhiteGlove = planId === "business" || planId === "enterprise";
  if (isWhiteGlove) {
    clearFreshSignupSession();
    return { shouldShow: false, reason: null, progress, planId };
  }

  const fresh = isFreshSignupSession();
  const incomplete = progress ? progress.agents === 0 : true;

  if (fresh) {
    return { shouldShow: true, reason: "fresh_signup", progress, planId };
  }

  if (!isPostSignupDismissed() && incomplete) {
    return { shouldShow: true, reason: "incomplete_fleet", progress, planId };
  }

  return { shouldShow: false, reason: null, progress, planId };
}
