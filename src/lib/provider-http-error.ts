/**
 * Translate an upstream provider's HTTP failure into a BotBound HTTP failure.
 * Platform credential identifiers remain internal; customer-facing messages
 * must describe BotBound rather than the retired brand.
 */

import { AppError } from "./api-error";
import { log } from "./server-context";

export interface ProviderHttpFailure {
  provider: string;
  path: string;
  status: number;
  detail?: string;
  unavailableMessage: string;
}

function isPlatformCredentialFailure(status: number): boolean {
  return status === 401 || status === 403 || status === 402;
}

export function providerHttpError(failure: ProviderHttpFailure): AppError {
  const { provider, path, status, detail, unavailableMessage } = failure;
  log.warn(`${provider} API error`, { path, status, detail });

  if (isPlatformCredentialFailure(status)) {
    log.error(`${provider} rejected the BotBound platform credential`, {
      path,
      status,
      detail,
    });
    return AppError.fromHttpStatus(502, unavailableMessage);
  }

  if (status === 429) {
    return AppError.fromHttpStatus(
      429,
      `${provider} is rate limiting BotBound right now. Try again in a moment.`,
    );
  }

  if (status >= 500) {
    return AppError.fromHttpStatus(502, unavailableMessage);
  }

  return AppError.fromHttpStatus(status, detail || `${provider} rejected the request (${status}).`);
}
