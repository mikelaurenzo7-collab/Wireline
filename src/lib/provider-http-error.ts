/**
 * src/lib/provider-http-error.ts
 *
 * Translate an upstream provider's HTTP failure into a Wireline HTTP failure.
 *
 * The naive translation — reuse the provider's status, reflect the provider's
 * message — is wrong in two specific ways, and both were live:
 *
 *   1. A provider 401/403 means WIRELINE's platform credential is bad: the
 *      LiveAvatar / HeyGen / OpenAI key is expired, revoked, or out of quota.
 *      Passing that status through makes it look like the *tenant's* session
 *      failed. The browser's `isAuthHttpStatus` treats any 401 as a dead
 *      session and force-signs-out the account holder, so rotating a platform
 *      key would eject every Live Video user from the product — with a
 *      "Please sign in again" toast pointing them at a problem they cannot
 *      fix and that has nothing to do with them.
 *
 *   2. The provider's own message is written for whoever holds the account —
 *      us. It can name the platform organization, key id, plan state, or
 *      internal quota. Reflecting it verbatim leaks operator detail to a
 *      tenant and, worse, tells them to go fix billing they do not own.
 *
 * So: auth-class provider failures become 502 with an operator-facing message,
 * rate limits stay 429 (the tenant should retry), and only genuine
 * request-shape errors keep the provider's status. The provider's own text is
 * logged for operators every time and never returned on the auth path.
 */

import { AppError } from "./api-error";
import { log } from "./server-context";

export interface ProviderHttpFailure {
  /** Human name of the upstream, used in operator logs. */
  provider: string;
  /** Upstream path or operation, for the log line only. */
  path: string;
  /** Status the provider returned. */
  status: number;
  /** Provider's own message, if it sent one. Logged, rarely surfaced. */
  detail?: string;
  /**
   * Tenant-safe sentence for the auth/quota case. Should say the feature is
   * unavailable and that Wireline is aware — never "check your billing".
   */
  unavailableMessage: string;
}

/**
 * True for statuses that indicate the PLATFORM's credential with the provider
 * failed, not anything the tenant did. 402 is included: a provider payment
 * failure is an operator problem, and surfacing 402 to the browser trips the
 * app's past-due billing UI for an account that is perfectly current.
 */
function isPlatformCredentialFailure(status: number): boolean {
  return status === 401 || status === 403 || status === 402;
}

/**
 * Build the AppError to throw for a non-OK provider response. Always logs the
 * provider's own detail at warn so operators can see the real cause.
 */
export function providerHttpError(failure: ProviderHttpFailure): AppError {
  const { provider, path, status, detail, unavailableMessage } = failure;
  log.warn(`${provider} API error`, { path, status, detail });

  if (isPlatformCredentialFailure(status)) {
    log.error(`${provider} rejected the Wireline platform credential`, {
      path,
      status,
      detail,
    });
    // 502, not the provider's status: this is an upstream failure of ours, and
    // a 401 here would sign the account holder out of Wireline.
    return AppError.fromHttpStatus(502, unavailableMessage);
  }

  if (status === 429) {
    return AppError.fromHttpStatus(
      429,
      `${provider} is rate limiting Wireline right now. Try again in a moment.`,
    );
  }

  if (status >= 500) {
    return AppError.fromHttpStatus(502, unavailableMessage);
  }

  // 4xx that is genuinely about this request (bad avatar id, unsupported
  // voice, malformed body). The provider's message is the useful one here.
  return AppError.fromHttpStatus(status, detail || `${provider} rejected the request (${status}).`);
}
