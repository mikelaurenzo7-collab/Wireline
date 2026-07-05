/** Session key for non-fatal warnings after Fast Start agent creation. */
export const CREATE_WARNING_SESSION_KEY = "wireline:create-warning";

export function stashCreateWarning(message: string): void {
  try {
    sessionStorage.setItem(CREATE_WARNING_SESSION_KEY, message);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Read once and clear — used by Studio on landing after create redirect. */
export function consumeCreateWarning(): string | null {
  try {
    const message = sessionStorage.getItem(CREATE_WARNING_SESSION_KEY);
    if (message) sessionStorage.removeItem(CREATE_WARNING_SESSION_KEY);
    return message;
  } catch {
    return null;
  }
}
