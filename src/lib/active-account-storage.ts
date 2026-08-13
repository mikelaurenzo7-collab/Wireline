/**
 * Persisted active-account selection.
 *
 * Lives outside AccountContext so AuthContext can clear it on sign-out without
 * importing the context module (which imports AuthContext back — a cycle that
 * cross-chunk bundling turns into runtime ReferenceErrors).
 */
const STORAGE_KEY = "wl_active_account";

export function readStoredAccountId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeActiveAccountId(accountId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, accountId);
  } catch {
    /* non-fatal */
  }
}

/** Sign-out must drop the persisted selection: account ids are per-user, and a
 *  survivor would seed the next signed-in user into the wrong workspace posture. */
export function clearStoredActiveAccount(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}
