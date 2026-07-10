export const DEFAULT_OAUTH_SIGNIN_ERROR =
  "We couldn't complete sign-in. Please try again.";

const SAFE_OAUTH_SIGNIN_ERRORS = new Set([
  "Invalid or expired sign-in state.",
  "Google did not return a code.",
  "Google did not return an email address.",
  "Microsoft did not return a code.",
  "Microsoft did not return an email address.",
  "Yahoo did not return a code.",
  "Yahoo did not return an email address.",
  "Sign-in session expired. Please try again.",
  "Failed to start session. Please try again.",
]);

/**
 * OAuth failures can contain provider bodies, SQL, connection details, or PII.
 * Only explicitly authored public messages may cross the redirect boundary.
 */
export function sanitizeOAuthSignInError(error: unknown): string {
  if (typeof error !== "string") return DEFAULT_OAUTH_SIGNIN_ERROR;
  const message = error.trim();
  return SAFE_OAUTH_SIGNIN_ERRORS.has(message) ? message : DEFAULT_OAUTH_SIGNIN_ERROR;
}
