/**
 * Shared reliability controls for every outbound Twilio message.
 *
 * Twilio can reject an otherwise valid request with an explicit HTTP 429 when
 * an account or sender reaches its concurrency limit. That response is safe to
 * retry because the provider did not accept the message. Network failures and
 * 5xx responses are deliberately *not* retried here: their acceptance state is
 * ambiguous and an automatic retry could send a duplicate message.
 */

export interface TwilioMessageRetryContext {
  retryNumber: number;
  delayMs: number;
  status: 429;
}

export interface TwilioMessageRetryOptions {
  maxAttempts?: number;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (context: TwilioMessageRetryContext) => void;
}

export type TwilioMessageCallbackScope = "operational";

const DEFAULT_MAX_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 100;
const MAX_BACKOFF_MS = 30_000;
const DEFAULT_VALIDITY_SECONDS = 3_600;
const MAX_VALIDITY_SECONDS = 36_000;

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function errorStatus(error: unknown): number {
  return Number((error as { status?: unknown } | null)?.status || 0);
}

/** Exponential 100ms backoff with the Twilio-recommended ±10% jitter. */
export function twilioRateLimitBackoffMs(
  attempt: number,
  random: () => number = Math.random,
): number {
  const normalizedAttempt = Math.max(0, Math.floor(attempt));
  const base = Math.min(INITIAL_BACKOFF_MS * 2 ** normalizedAttempt, MAX_BACKOFF_MS);
  const sample = Math.max(0, Math.min(1, Number(random()) || 0));
  return Math.max(0, Math.round(base * (0.9 + sample * 0.2)));
}

export function boundedTwilioMessageValidityPeriod(
  configured: string | number | undefined = process.env.TWILIO_MESSAGE_VALIDITY_SECONDS,
): number {
  const parsed = Number(configured ?? DEFAULT_VALIDITY_SECONDS);
  if (!Number.isFinite(parsed)) return DEFAULT_VALIDITY_SECONDS;
  return Math.max(60, Math.min(MAX_VALIDITY_SECONDS, Math.floor(parsed)));
}

export function twilioMessageStatusCallbackUrl(
  configuredAppUrl: string | undefined = process.env.APP_URL,
  scope?: TwilioMessageCallbackScope,
): string {
  const baseUrl = (configuredAppUrl?.trim() || "https://trywireline.com").replace(/\/+$/, "");
  const callbackUrl = `${baseUrl}/api/twilio-webhook/message-status`;
  return scope ? `${callbackUrl}?scope=${scope}` : callbackUrl;
}

/** Add delivery telemetry and a bounded stale-message lifetime to a payload. */
export function withTwilioMessageReliability<TPayload extends Record<string, unknown>>(
  payload: TPayload,
  options: {
    appUrl?: string;
    validitySeconds?: string | number;
    scope?: TwilioMessageCallbackScope;
  } = {},
): TPayload & { statusCallback: string; validityPeriod: number } {
  return {
    ...payload,
    statusCallback: twilioMessageStatusCallbackUrl(options.appUrl, options.scope),
    validityPeriod: boundedTwilioMessageValidityPeriod(options.validitySeconds),
  };
}

/**
 * Retry only explicit provider 429 responses. All ambiguous failures escape on
 * the first attempt so callers can reconcile rather than risk duplicate sends.
 */
export async function createTwilioMessageWithRateLimitRetry<TMessage>(
  createMessage: () => Promise<TMessage>,
  options: TwilioMessageRetryOptions = {},
): Promise<TMessage> {
  const maxAttempts = Math.max(
    1,
    Math.min(6, Math.floor(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)),
  );
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await createMessage();
    } catch (error) {
      const status = errorStatus(error);
      if (status !== 429 || attempt === maxAttempts - 1) throw error;

      const delayMs = twilioRateLimitBackoffMs(attempt, random);
      options.onRetry?.({ retryNumber: attempt + 1, delayMs, status: 429 });
      await sleep(delayMs);
    }
  }

  // The loop always returns or throws. Keep a defensive terminal for future
  // refactors that change the attempt bounds.
  throw new Error("Twilio message retry budget exhausted");
}
