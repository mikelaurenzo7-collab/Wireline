/**
 * The account this tab is signed in as, for work that can outlive its screen.
 *
 * A save started for one account must not finish for another after a sign-out
 * or account switch, and a session probe that could not answer owns nothing.
 * AuthContext sets this on every hydration; long-running saves (Bot Set Up,
 * Bo's first conversation) check it before each write and before reporting.
 */
let currentOwner: string | null | undefined;

/** Session keys of first-run screens this release retired. Their text was private business input. */
const RETIRED_SESSION_KEY_PREFIXES = ["wireline:create-brief:v1:", "wireline:post-create-wizard"];

export function setSignedInOwner(userId: string | null): void {
  currentOwner = userId;
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key && RETIRED_SESSION_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Browser storage can be denied; there is then nothing stored to clear.
  }
}

/** An inconclusive session probe cannot establish ownership. */
export function suspendSignedInOwner(): void {
  currentOwner = null;
}

export function isSignedInOwner(userId: string): boolean {
  return Boolean(userId) && (currentOwner === undefined || currentOwner === userId);
}
