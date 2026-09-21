import { OAUTH_SIGNUP_CONSENT_REQUIRED } from "./legal-consent";

export const DEFAULT_OAUTH_SIGNIN_ERROR = "We couldn't complete sign-in. Please try again.";
export const OAUTH_UNVERIFIED_ACCOUNT_COLLISION =
  "An unverified account already uses this email. Use its original sign-in method or contact support.";

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
  OAUTH_SIGNUP_CONSENT_REQUIRED,
  OAUTH_UNVERIFIED_ACCOUNT_COLLISION,
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
