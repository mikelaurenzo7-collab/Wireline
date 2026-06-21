/**
 * Post-signup onboarding — first-session Fast Start orchestration.
 * North star: time to first useful production call (tenant activation).
 */

import { authFetch } from "./api";
import {
  fetchFleetSetupProgress,
  fetchActivationStatus,
  isFleetSetupComplete,
  type FleetSetupProgress,
} from "./fleet-setup-progress";
import type { TenantActivationStatus } from "./tenant-activation";

export const FRESH_SIGNUP_SESSION_KEY = "wireline_fresh_signup";
export const POST_SIGNUP_FLOW_SESSION_KEY = "wireline_post_signup_flow";
export const POST_SIGNUP_DISMISS_KEY = "wireline_post_signup_dismissed";
export const ACTIVATION_CELEBRATED_KEY = "wireline_activation_celebrated";

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

export async function fetchActivationStatusFull(): Promise<TenantActivationStatus | null> {
  try {
    const res = await authFetch("/api/activation/status");
    if (!res.ok) return null;
    return (await res.json()) as TenantActivationStatus;
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

/** Skip auto product tour without finishing Assistants setup (explore-first path). */
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

export function isActivationCelebrated(): boolean {
  try {
    return localStorage.getItem(ACTIVATION_CELEBRATED_KEY) === "true";
  } catch {
    return false;
  }
}

export function markActivationCelebrated(): void {
  try {
    localStorage.setItem(ACTIVATION_CELEBRATED_KEY, "true");
  } catch {
    /* ignore */
  }
}

export type PostSignupEligibility = {
  shouldShow: boolean;
  reason: "fresh_signup" | "incomplete_fleet" | null;
  progress: FleetSetupProgress | null;
  planId: string | null;
  activated: boolean;
};

/** Whether to auto-open the welcome + Fast Start flow. */
export async function evaluatePostSignupEligibility(): Promise<PostSignupEligibility> {
  const [prefs, progress, planId, activation] = await Promise.all([
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
    fetchActivationStatus(),
  ]);

  if (activation) {
    if (!prefs?.onboarding_completed) {
      await markOnboardingCompleted();
      markOnboardingCelebrated();
    }
    clearFreshSignupSession();
    return { shouldShow: false, reason: null, progress, planId, activated: true };
  }

  if (prefs?.onboarding_completed) {
    clearFreshSignupSession();
    return { shouldShow: false, reason: null, progress, planId, activated: false };
  }

  if (progress && isFleetSetupComplete(progress)) {
    clearFreshSignupSession();
    return { shouldShow: false, reason: null, progress, planId, activated: false };
  }

  const isWhiteGlove = planId === "business" || planId === "enterprise";
  if (isWhiteGlove) {
    clearFreshSignupSession();
    return { shouldShow: false, reason: null, progress, planId, activated: false };
  }

  const fresh = isFreshSignupSession();
  const incomplete = progress ? progress.agents === 0 : true;

  if (fresh) {
    return { shouldShow: true, reason: "fresh_signup", progress, planId, activated: false };
  }

  if (!isPostSignupDismissed() && incomplete) {
    return { shouldShow: true, reason: "incomplete_fleet", progress, planId, activated: false };
  }

  return { shouldShow: false, reason: null, progress, planId, activated: false };
}
