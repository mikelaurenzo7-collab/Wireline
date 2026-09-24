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

import { getDeploymentIdentity } from "./deployment-environment";
import { getErrorMessage, sanitizeErrorMessage } from "./server-utils";

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

const REDACTED = "[REDACTED]";
const MAX_CONTEXT_DEPTH = 8;
const MAX_COLLECTION_ITEMS = 100;
const MAX_TELEMETRY_STRING_LENGTH = 2_000;
const TELEMETRY_TRUNCATION_MARKER = "…[truncated]";

// `sanitizeErrorMessage` owns the common log-boundary patterns (email, UUID,
// Authorization headers, signed query values, and Drizzle parameter tails).
// These additional patterns cover telemetry-only structures such as arbitrary
// context strings and provider error stacks. They intentionally require either
// a credential label or a recognizable phone shape so useful numbers such as
// HTTP statuses, retry counts, durations, and source locations survive.
const SECRET_HEADER_RE = /\b(authorization|cookie|set-cookie)\s*:\s*[^\r\n]*/gi;
const NAMED_SECRET_VALUE_RE =
  /(\b(?:access[_\s-]?token|refresh[_\s-]?token|api[_\s-]?key|authorization|auth|cookie|credential|password|passwd|secret|session|signature|token)\b["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]\r\n]+)/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g;
const PREFIXED_CREDENTIAL_RE =
  /\b(?:(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]{8,}|(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{10,}|SG\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g;
const INTERNATIONAL_PHONE_RE = /(^|[^\dA-Za-z])\+\d(?:[\s().-]*\d){7,14}(?!\d)/g;
const FORMATTED_PHONE_RE = /(^|[^\d])(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g;

const SENSITIVE_FIELD_SEGMENTS = new Set([
  "auth",
  "authorization",
  "cookie",
  "credential",
  "credentials",
  "email",
  "key",
  "mobile",
  "otp",
  "parameter",
  "parameters",
  "params",
  "passcode",
  "passwd",
  "password",
  "phone",
  "secret",
  "session",
  "signature",
  "token",
]);

function sanitizeTelemetryText(value: string): string {
  const sanitized = sanitizeErrorMessage(value)
    .replace(SECRET_HEADER_RE, "$1: [REDACTED]")
    .replace(NAMED_SECRET_VALUE_RE, "$1[REDACTED]")
    .replace(JWT_RE, REDACTED)
    .replace(PREFIXED_CREDENTIAL_RE, REDACTED)
    .replace(INTERNATIONAL_PHONE_RE, "$1[redacted-phone]")
    .replace(FORMATTED_PHONE_RE, "$1[redacted-phone]");

  if (sanitized.length <= MAX_TELEMETRY_STRING_LENGTH) return sanitized;
  return `${sanitized.slice(
    0,
    MAX_TELEMETRY_STRING_LENGTH - TELEMETRY_TRUNCATION_MARKER.length,
  )}${TELEMETRY_TRUNCATION_MARKER}`;
}

function isSensitiveFieldName(key: string): boolean {
  const segments = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return segments.some((segment) => SENSITIVE_FIELD_SEGMENTS.has(segment));
}

/**
 * Convert arbitrary telemetry context into a bounded, JSON-safe, recursively
 * redacted value. This is deliberately applied to the final event, not only
 * user-supplied `extra`, so future payload fields cannot bypass the boundary.
 */
function sanitizeTelemetryValue(
  value: unknown,
  depth = 0,
  ancestors = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeTelemetryText(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol" || typeof value === "function") return `[${typeof value}]`;
  if (depth >= MAX_CONTEXT_DEPTH) return "[Truncated]";

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
  }
  if (value instanceof URL) return sanitizeTelemetryText(value.toString());
  if (value instanceof Error) {
    return {
      name: sanitizeTelemetryText(value.name || "Error"),
      message: sanitizeTelemetryText(value.message),
      ...(value.stack ? { stack: sanitizeTelemetryText(value.stack) } : {}),
    };
  }

  if (ancestors.has(value)) return "[Circular]";
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_COLLECTION_ITEMS)
        .map((item) => sanitizeTelemetryValue(item, depth + 1, ancestors));
      if (value.length > MAX_COLLECTION_ITEMS) {
        items.push(`[Truncated ${value.length - MAX_COLLECTION_ITEMS} items]`);
      }
      return items;
    }

    if (value instanceof Map) {
      return sanitizeTelemetryValue(
        Array.from(value.entries()).slice(0, MAX_COLLECTION_ITEMS),
        depth + 1,
        ancestors,
      );
    }
    if (value instanceof Set) {
      return sanitizeTelemetryValue(
        Array.from(value.values()).slice(0, MAX_COLLECTION_ITEMS),
        depth + 1,
        ancestors,
      );
    }

    let entries: [string, unknown][];
    try {
      entries = Object.entries(value as Record<string, unknown>);
    } catch {
      return "[Unserializable]";
    }

    const out = Object.create(null) as Record<string, unknown>;
    for (const [rawKey, item] of entries.slice(0, MAX_COLLECTION_ITEMS)) {
      const safeKey = sanitizeTelemetryText(rawKey);
      out[safeKey] = isSensitiveFieldName(rawKey)
        ? REDACTED
        : sanitizeTelemetryValue(item, depth + 1, ancestors);
    }
    if (entries.length > MAX_COLLECTION_ITEMS) {
      out._truncated = `${entries.length - MAX_COLLECTION_ITEMS} fields`;
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
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
  // we don't parse frames, so a real redacted stack in `extra` is more useful
  // (and honest) than an empty `frames: []`. Only attach it for genuine Error
  // instances: a stack synthesized for a non-Error throwable would point at
  // this reporter, not the real throw site, which is worse than none.
  const realStack = error instanceof Error ? error.stack : undefined;
  const extra = realStack ? { ...rest, stack: realStack } : rest;
  const deployment = getDeploymentIdentity();

  const payload = {
    event_id: newEventId(),
    timestamp: Date.now() / 1000,
    platform: "node",
    level: "error",
    logger: "wireline-server",
    environment: deployment.environment,
    ...(deployment.sourceCommit ? { release: deployment.sourceCommit } : {}),
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

  return sanitizeTelemetryValue(payload) as Record<string, unknown>;
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
