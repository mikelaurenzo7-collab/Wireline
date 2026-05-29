/**
 * Server-side error reporter for the paths where a silent failure costs money
 * or customers: the global Express error handler, process-level safety nets
 * (unhandledRejection / uncaughtException), the background job worker, Stripe
 * webhook processing, call processing, and email transport.
 *
 * Design: ships exceptions to Sentry via its HTTP "store" endpoint using the
 * native `fetch` ONLY — there is no `@sentry/*` dependency. This module is
 * never imported by browser code, so it adds ZERO frontend bundle weight (the
 * reason the SDK was removed pre-launch, see ./sentry.ts), and there is no SDK
 * upkeep. When SENTRY_DSN is not configured it is a safe no-op: the existing
 * structured ERROR logs (captured by Vercel) remain the record.
 *
 * Contract: NEVER throws and NEVER blocks the caller. The network send is
 * fire-and-forget behind a hard timeout. Safe to call from any catch block.
 */

import { IS_PROD } from "./server-logger";
import { getErrorMessage } from "./server-utils";

export interface ErrorContext {
  /** Indexed, low-cardinality labels (searchable/filterable in Sentry). */
  tags?: Record<string, string | number | boolean | null | undefined>;
  /** Anything else useful for debugging — attached as `extra`. */
  [key: string]: unknown;
}

interface ParsedDsn {
  /** Fully-qualified Sentry store endpoint to POST events to. */
  storeUrl: string;
  /** The DSN public key, used in the X-Sentry-Auth header. */
  publicKey: string;
}

/**
 * Parse a Sentry DSN (`https://PUBLIC_KEY@host/PROJECT_ID`, with an optional
 * legacy `:SECRET`) into the store endpoint + public key. Returns null for
 * anything malformed so the caller degrades to log-only.
 */
export function parseSentryDsn(dsn: string | undefined | null): ParsedDsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const publicKey = u.username;
    const projectId = u.pathname.replace(/^\/+/, "").split("/").filter(Boolean).pop();
    if (!publicKey || !projectId) return null;
    return {
      publicKey,
      storeUrl: `${u.protocol}//${u.host}/api/${projectId}/store/`,
    };
  } catch {
    return null;
  }
}

/** Build the X-Sentry-Auth header value for the given public key. */
export function buildSentryAuthHeader(publicKey: string): string {
  return [
    "Sentry sentry_version=7",
    "sentry_client=wireline-server/1.0",
    `sentry_key=${publicKey}`,
  ].join(", ");
}

/** 32-char hex event id (UUID v4 without dashes), as Sentry expects. */
function newEventId(): string {
  try {
    return (globalThis.crypto?.randomUUID?.() ?? "").replace(/-/g, "") || fallbackEventId();
  } catch {
    return fallbackEventId();
  }
}

function fallbackEventId(): string {
  let s = "";
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/**
 * Build the Sentry "store" event payload from an error + context. Pure and
 * deterministic apart from the generated event id / timestamp, so the shape
 * is unit-testable.
 */
export function buildSentryStorePayload(
  error: unknown,
  context: ErrorContext = {},
): Record<string, unknown> {
  const { tags, ...rest } = context;
  const err = error instanceof Error ? error : new Error(getErrorMessage(error));
  // Surface the stack as `extra` rather than a synthetic stacktrace object —
  // we don't parse frames, so a real raw stack in `extra` is more useful (and
  // honest) than an empty `frames: []`. Only attach it for genuine Error
  // instances: a stack synthesized for a non-Error throwable would point at
  // this reporter, not the real throw site, which is worse than none.
  const realStack = error instanceof Error ? error.stack : undefined;
  const extra = realStack ? { ...rest, stack: realStack } : rest;

  return {
    event_id: newEventId(),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    logger: "wireline-server",
    environment: IS_PROD ? "production" : process.env.NODE_ENV || "development",
    ...(process.env.VERCEL_GIT_COMMIT_SHA ? { release: process.env.VERCEL_GIT_COMMIT_SHA } : {}),
    exception: {
      values: [
        {
          type: err.name || "Error",
          value: err.message || getErrorMessage(error),
        },
      ],
    },
    ...(tags && Object.keys(tags).length ? { tags: cleanTags(tags) } : {}),
    ...(Object.keys(extra).length ? { extra } : {}),
  };
}

function cleanTags(
  tags: Record<string, string | number | boolean | null | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    if (v === null || v === undefined) continue;
    out[k] = String(v);
  }
  return out;
}

const SEND_TIMEOUT_MS = 2_000;

async function shipToSentry(parsed: ParsedDsn, payload: Record<string, unknown>): Promise<void> {
  try {
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(SEND_TIMEOUT_MS)
        : undefined;
    await fetch(parsed.storeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sentry-auth": buildSentryAuthHeader(parsed.publicKey),
      },
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    });
  } catch {
    // Swallow — a telemetry transport must never amplify an incident. The
    // local log.error below is the durable record regardless.
  }
}

/**
 * Report a server-side exception to Sentry. Fire-and-forget: returns
 * immediately. A no-op when SENTRY_DSN is unset. Never throws.
 *
 * Call sites keep their own `log.error(...)` — that structured log (captured
 * by Vercel) is the always-on record; this adds external alerting on top when
 * a DSN is configured.
 */
export function reportError(error: unknown, context: ErrorContext = {}): void {
  try {
    const parsed = parseSentryDsn(process.env.SENTRY_DSN);
    if (parsed) {
      void shipToSentry(parsed, buildSentryStorePayload(error, context));
    }
  } catch {
    // never let reporting throw
  }
}
