export const FRESH_SIGNUP_SESSION_KEY = "wireline_fresh_signup";
export const POST_SIGNUP_FLOW_SESSION_KEY = "wireline_post_signup_flow";
export const ACTIVATION_CELEBRATED_KEY = "wireline_activation_celebrated";

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

export function activationCelebratedStorageKey(scopeId: string): string {
  return `${ACTIVATION_CELEBRATED_KEY}:${scopeId}`;
}

export function isActivationCelebrated(scopeId: string | null | undefined): boolean {
  if (!scopeId) return false;
  try {
    return localStorage.getItem(activationCelebratedStorageKey(scopeId)) === "true";
  } catch {
    return false;
  }
}
