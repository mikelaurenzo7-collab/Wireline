import express from "express";
import cors from "cors";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SchemaType } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import Stripe from "stripe";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import * as claudeBrain from "./src/lib/claude-brain";

dotenv.config();

// On Vercel, VERCEL_URL is automatically set to the deployment hostname
// (e.g. "myapp-abc123.vercel.app") with no protocol or trailing slash.
// When APP_URL isn't explicitly configured, derive it from VERCEL_URL so
// OAuth callbacks, billing redirects, and CORS work out of the box on
// preview and production deployments without manual configuration.
// Strip any accidental protocol prefix to guard against misconfiguration.
if (!process.env.APP_URL && process.env.VERCEL_URL) {
  const hostname = process.env.VERCEL_URL.replace(/^https?:\/\/|\/+$/g, '');
  process.env.APP_URL = `https://${hostname}`;
}

const DEFAULT_AGENT_ROLE = "customer_service";
const IS_PROD = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

// ────────────────────────────────────────────────────────────────────
//  Structured logger — single-line JSON in production, pretty in dev.
//  Centralizing console.* calls so we can ship to Datadog/Logtail later
//  without rewriting every call site. Levels: debug | info | warn | error.
// ────────────────────────────────────────────────────────────────────
type LogLevel = "debug" | "info" | "warn" | "error";
function emitLog(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...(fields || {}) };
  if (IS_PROD) {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(JSON.stringify(entry));
  } else {
    // eslint-disable-next-line no-console
    (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(
      `[${level}]`, msg, fields ?? ""
    );
  }
}
const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emitLog("debug", msg, fields),
  info:  (msg: string, fields?: Record<string, unknown>) => emitLog("info", msg, fields),
  warn:  (msg: string, fields?: Record<string, unknown>) => emitLog("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emitLog("error", msg, fields),
};

// ────────────────────────────────────────────────────────────────────
//  fetchWithTimeout — every outbound HTTP call (Vapi, Gmail, generic)
//  must have a deadline. node-fetch has no default; a stalled
//  connection will hang the request handler indefinitely. 15s is
//  long enough for legitimate slow APIs, short enough to fail fast.
// ────────────────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ────────────────────────────────────────────────────────────────────
//  Startup env validation — fail fast in production rather than
//  silently booting with placeholder Supabase URLs / missing webhook
//  secrets. Log warnings (not errors) in dev so local hacking still works.
// ────────────────────────────────────────────────────────────────────
function validateStartupEnv() {
  const required = [
    ["VITE_SUPABASE_URL", process.env.VITE_SUPABASE_URL],
    ["VITE_SUPABASE_ANON_KEY", process.env.VITE_SUPABASE_ANON_KEY],
  ] as const;
  const missing = required.filter(([, v]) => !v).map(([k]) => k);
  const recommended: string[] = [];
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) recommended.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!process.env.ANTHROPIC_API_KEY) recommended.push("ANTHROPIC_API_KEY");
  if (!process.env.VAPI_WEBHOOK_SECRET) recommended.push("VAPI_WEBHOOK_SECRET");
  if (!process.env.APP_URL) recommended.push("APP_URL");

  if (missing.length) {
    if (IS_PROD) {
      log.error("Refusing to start: required env vars are missing", { missing });
      // Exit synchronously so the platform restart loop kicks in instead of
      // accepting traffic in a broken state.
      process.exit(1);
    } else {
      log.warn("Required env vars missing (dev mode — continuing with placeholders)", { missing });
    }
  }
  if (recommended.length) {
    log.warn("Recommended env vars not set", { recommended });
  }
}
validateStartupEnv();

const app = express();
const PORT = 3000;

// ────────────────────────────────────────────────────────────────────
//  CORS — locked down to an explicit allowlist via CORS_ORIGINS
//  (comma-separated). In dev (no NODE_ENV=production / VERCEL=1) we
//  fall back to allowing all origins to keep `npm run dev` painless.
// ────────────────────────────────────────────────────────────────────
const corsAllowList = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (IS_PROD && corsAllowList.length === 0 && process.env.APP_URL) {
  corsAllowList.push(process.env.APP_URL);
}
app.use(
  cors({
    origin: (origin, callback) => {
      // Same-origin / curl / server-to-server have no Origin header.
      if (!origin) return callback(null, true);
      if (!IS_PROD && corsAllowList.length === 0) return callback(null, true);
      if (corsAllowList.includes(origin)) return callback(null, true);
      log.warn("CORS rejected origin", { origin });
      return callback(new Error("Origin not permitted by CORS"));
    },
    credentials: true,
  }),
);
// Stripe webhook needs the RAW body bytes to verify the signature, so
// register raw-body middleware on that exact path BEFORE the global
// JSON parser. The handler reads `req.body` as a Buffer.
app.use("/api/stripe-webhook", express.raw({ type: "application/json" }));
// Bump body limit so base64-encoded PDF uploads (up to ~32MB raw / ~43MB
// base64) fit comfortably for the knowledge-from-document recipe.
app.use(express.json({ limit: '50mb' }));

// ────────────────────────────────────────────────────────────────────
//  Request correlation IDs — every request gets a stable id we attach
//  to res.locals + an X-Request-Id response header. Client-supplied
//  X-Request-Id is honored if present so traces can flow end-to-end.
// ────────────────────────────────────────────────────────────────────
app.use((req: any, res: any, next: any) => {
  const incoming = (req.headers["x-request-id"] as string | undefined)?.slice(0, 64);
  const requestId = incoming && /^[A-Za-z0-9._-]+$/.test(incoming) ? incoming : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
});

// ────────────────────────────────────────────────────────────────────
//  Security headers — hand-rolled (no helmet dep) so we control the
//  exact set of headers and CSP directives. Applied to every response.
//  CSP intentionally permissive for inline scripts because the OAuth
//  callback page injects a JSON-encoded postMessage script; tighten
//  with a nonce when that page moves to a static asset.
// ────────────────────────────────────────────────────────────────────
app.use((_req: any, res: any, next: any) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=(self)");
  if (IS_PROD) {
    // 6 months HSTS preload-eligible — only in prod so dev over http stays usable.
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

// ────────────────────────────────────────────────────────────────────
//  Slow-request logging — emit a structured warning when any handler
//  exceeds 5s. Helps surface stalled Vapi / Gmail / Claude paths in
//  prod logs without instrumenting every route by hand.
// ────────────────────────────────────────────────────────────────────
const SLOW_REQUEST_THRESHOLD_MS = 5_000;
app.use((req: any, res: any, next: any) => {
  const start = Date.now();
  res.on("finish", () => {
    const dur = Date.now() - start;
    if (dur >= SLOW_REQUEST_THRESHOLD_MS) {
      log.warn("slow request", {
        requestId: res.locals?.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: dur,
      });
    }
  });
  next();
});

// ────────────────────────────────────────────────────────────────────
//  Health check — for uptime monitors, load balancers, and the AI
//  Studio container's readiness probe. Public, no auth. Probes the
//  database with a short timeout so we report `degraded` (HTTP 503)
//  when Supabase is unreachable rather than lying with `ok`.
// ────────────────────────────────────────────────────────────────────
async function probeDatabase(timeoutMs = 1500): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const probe = db.from("wireline_settings").select("user_id", { head: true, count: "exact" }).limit(1);
    const result = await Promise.race([
      probe,
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error("db probe timed out")), timeoutMs)),
    ]) as { error?: { message: string } | null };
    if (result?.error) return { ok: false, latency_ms: Date.now() - t0, error: result.error.message };
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (err: any) {
    return { ok: false, latency_ms: Date.now() - t0, error: err?.message || String(err) };
  }
}

app.get("/api/health", async (_req, res) => {
  const dbStatus = await probeDatabase();
  const status = dbStatus.ok ? "ok" : "degraded";
  res.status(dbStatus.ok ? 200 : 503).json({
    status,
    uptime_s: Math.round(process.uptime()),
    db: dbStatus,
    capabilities: {
      claude:    !!process.env.ANTHROPIC_API_KEY,
      gemini:    !!process.env.GEMINI_API_KEY,
      vapi:      !!process.env.VAPI_PRIVATE_KEY,
      supabase:  !!process.env.VITE_SUPABASE_URL,
      google_oauth: !!process.env.GOOGLE_CLIENT_ID,
    },
    timestamp: new Date().toISOString(),
  });
});

// ────────────────────────────────────────────────────────────────────
//  Per-user rate limit for /api/claude/* — cost protection.
//
//  Claude Opus 4.7 is expensive ($5/M input, $25/M output). A single
//  user accidentally hammering an endpoint (or a rogue script) could
//  rack up real $$. Cap at 60 requests / minute / user. Uses a
//  rolling 60-second window in-memory — fine for single-process
//  deployment; swap to Redis if you go multi-region.
// ────────────────────────────────────────────────────────────────────
const claudeRateLimit = new Map<string, number[]>();
const CLAUDE_RATE_WINDOW_MS = 60_000;
const CLAUDE_RATE_MAX = 60;

// Reusable per-user rate-limiter for any endpoint that calls Claude.
// Keys by Bearer token (available before authenticateUser runs); falls
// back to IP so unauthenticated edge cases are still covered.
function claudeRateLimiter(req: any, res: any, next: any) {
  const token = req.headers.authorization?.split(" ")[1];
  const key = token || req.ip || "anon";
  const now = Date.now();
  const hits = (claudeRateLimit.get(key) || []).filter((t: number) => now - t < CLAUDE_RATE_WINDOW_MS);
  if (hits.length >= CLAUDE_RATE_MAX) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({
      error: `Rate limit exceeded — ${CLAUDE_RATE_MAX} requests per minute. Slow down.`,
      code: "CLAUDE_RATE_LIMIT",
    });
  }
  hits.push(now);
  claudeRateLimit.set(key, hits);
  next();
}

app.use("/api/claude", (req: any, res: any, next: any) => {
  // Status endpoint is exempt — used by clients to probe availability.
  if (req.path === "/status") return next();
  claudeRateLimiter(req, res, next);
});

// Extend Claude rate limiting to non-/api/claude/* endpoints that also
// make Claude calls so they share the same per-user budget.
app.use(["/api/train/extract", "/api/agents/:id/optimize"], claudeRateLimiter);

// Keep the rate-limit map from growing forever — purge stale buckets every
// 5 minutes. Cheap operation; map rarely has more than a few hundred keys.
setInterval(() => {
  const cutoff = Date.now() - CLAUDE_RATE_WINDOW_MS * 2;
  for (const [k, hits] of claudeRateLimit) {
    const fresh = hits.filter((t: number) => t > cutoff);
    if (fresh.length === 0) claudeRateLimit.delete(k);
    else claudeRateLimit.set(k, fresh);
  }
}, 5 * 60 * 1000).unref?.();

// ────────────────────────────────────────────────────────────────────
//  IP-based rate limit for unauthenticated OAuth initiation.
//  Prevents a crawler from generating unlimited Google OAuth flows.
//  10 requests per 5 minutes per IP is generous for legitimate use.
// ────────────────────────────────────────────────────────────────────
const oauthRateLimit = new Map<string, number[]>();
const OAUTH_RATE_WINDOW_MS = 5 * 60_000;
const OAUTH_RATE_MAX = 10;

function oauthRateLimiter(req: any, res: any, next: any) {
  const key = req.ip || "anon";
  const now = Date.now();
  const hits = (oauthRateLimit.get(key) || []).filter((t: number) => now - t < OAUTH_RATE_WINDOW_MS);
  if (hits.length >= OAUTH_RATE_MAX) {
    res.setHeader("Retry-After", String(Math.ceil(OAUTH_RATE_WINDOW_MS / 1000)));
    return res.status(429).json({
      error: "Too many OAuth requests. Please wait before trying again.",
      code: "OAUTH_RATE_LIMIT",
    });
  }
  hits.push(now);
  oauthRateLimit.set(key, hits);
  next();
}

setInterval(() => {
  const cutoff = Date.now() - OAUTH_RATE_WINDOW_MS * 2;
  for (const [k, hits] of oauthRateLimit) {
    const fresh = hits.filter((t: number) => t > cutoff);
    if (fresh.length === 0) oauthRateLimit.delete(k);
    else oauthRateLimit.set(k, fresh);
  }
}, 10 * 60 * 1000).unref?.();

// Initialize AI and DB
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Google Workspace OAuth Setup
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

function getGoogleOAuthClient(req: express.Request) {
   // OAuth redirect URI MUST match what's registered in Google Cloud
   // Console exactly. Prefer APP_URL (operator-controlled) over the
   // request Host header (attacker-controlled). When APP_URL isn't
   // set we fall back to the request host but only allow it if it
   // matches one of the configured CORS origins — otherwise an attacker
   // who can spoof the Host header could redirect the OAuth flow to
   // their own server and steal the token.
   let baseUrl = process.env.APP_URL;
   if (!baseUrl) {
      const hostHeader = req.get('host');
      const candidate = hostHeader ? `${req.protocol}://${hostHeader}` : null;
      if (candidate && (corsAllowList.length === 0 || corsAllowList.includes(candidate))) {
         baseUrl = candidate;
      } else {
         log.error("OAuth redirect URI: APP_URL unset and Host header not in CORS_ORIGINS", {
            host: hostHeader,
         });
         throw new Error("OAuth misconfigured: set APP_URL or add the host to CORS_ORIGINS.");
      }
   }
   return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${baseUrl}/api/oauth/google/callback`
   );
}

// Note: Backend uses Service Role for secure modifications across the DB if needed.
// In dev we still allow a placeholder so `npm run dev` doesn't crash before
// the operator fills in .env; in prod validateStartupEnv() above already
// process.exit(1)s when these are missing.
const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://placeholder-url.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";
const db = createClient(supabaseUrl, supabaseKey);

// ────────────────────────────────────────────────────────────────────
//  Stripe — billing source of truth.
//
//  Plan catalog is defined in code (so it's easy to read), but the
//  actual price ids come from env vars so test-mode and live-mode
//  prices can swap without code changes. When STRIPE_SECRET_KEY is
//  unset, the SDK is constructed with a placeholder so the server
//  still boots in dev — every billing endpoint defensively returns
//  503 if `stripeAvailable()` is false.
// ────────────────────────────────────────────────────────────────────

export type StripePlan = {
  id: "starter" | "pro" | "enterprise";
  name: string;
  price_usd_monthly: number;
  max_agents: number;
  features: string[];
  // Resolved at request time so env changes don't require a restart.
  priceIdEnv: string;
};

const STRIPE_PLANS: StripePlan[] = [
  {
    id: "starter",
    name: "Starter",
    price_usd_monthly: 49,
    max_agents: 3,
    priceIdEnv: "STRIPE_STARTER_PRICE_ID",
    features: [
      "3 voice + email agents",
      "Unlimited inbound calls",
      "100 outbound calls / month",
      "Daily Brief + Triage",
      "Webhooks · Intake API",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price_usd_monthly: 199,
    max_agents: 10,
    priceIdEnv: "STRIPE_PRO_PRICE_ID",
    features: [
      "10 agents",
      "Unlimited outbound",
      "All Starter features",
      "Insights + Knowledge Atlas",
      "Auto-dial intake",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price_usd_monthly: 999,
    max_agents: 100,
    priceIdEnv: "STRIPE_ENTERPRISE_PRICE_ID",
    features: [
      "100 agents",
      "All Pro features",
      "SSO + SAML",
      "Custom data retention",
      "Dedicated success manager",
      "99.95% uptime SLA",
    ],
  },
];

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_placeholder", {
  apiVersion: "2025-09-30.clover" as any,
  typescript: true,
});
function stripeAvailable() {
  return !!process.env.STRIPE_SECRET_KEY;
}
function planByPriceId(priceId: string | null | undefined): StripePlan | null {
  if (!priceId) return null;
  return STRIPE_PLANS.find(p => process.env[p.priceIdEnv] === priceId) || null;
}
function planById(id: string): StripePlan | null {
  return STRIPE_PLANS.find(p => p.id === id) || null;
}
function plansForClient() {
  return STRIPE_PLANS.map(p => ({
    id: p.id,
    name: p.name,
    price_usd_monthly: p.price_usd_monthly,
    max_agents: p.max_agents,
    features: p.features,
    // Don't expose env var names; just whether the price is configured.
    configured: !!process.env[p.priceIdEnv],
  }));
}

// ────────────────────────────────────────────────────────────────────
//  Outbound webhooks dispatcher — module-scope so the vapi webhook
//  handler (also module-level, registered before startServer) can
//  call it. The CRUD endpoints for managing webhooks live inside
//  startServer alongside the other auth-gated routes.
// ────────────────────────────────────────────────────────────────────
const WEBHOOK_EVENTS = [
  "call.completed",
  "call.escalated",
  "lead.received",
  "lead.hot",
  "email.received",
  "appointment.booked",
  "task.created",
  "compliance.flagged",
  "spend.warning",
  "spend.exceeded",
  "subscription.changed",
] as const;
type WebhookEvent = typeof WEBHOOK_EVENTS[number];

// Backoff between retries, indexed by failed-attempts count after the
// inline first attempt. attempts=1 → wait 30s, =2 → 2m, =3 → 10m,
// =4 → 1h. With max_attempts=5, the 5th failure marks status='dead'
// (no further retry — operator can manually requeue from the UI).
const WEBHOOK_RETRY_BACKOFF_MS = [
  30_000,        // 30s
  2 * 60_000,    // 2m
  10 * 60_000,   // 10m
  60 * 60_000,   // 1h
];

const WEBHOOK_TIMEOUT_MS = 10_000;
const WEBHOOK_DEFAULT_MAX_ATTEMPTS = 5;

async function attemptWebhookDelivery(deliveryId: number) {
  // Pull the delivery and its hook in one round-trip via a join shape
  // Supabase supports natively. We re-read the hook each time so a
  // disabled / deleted hook short-circuits cleanly.
  const { data: row } = await db
    .from("wireline_webhook_deliveries")
    .select("id, user_id, webhook_id, event, payload, attempts, max_attempts, status, wireline_webhooks(id, url, secret, active, delivery_count)")
    .eq("id", deliveryId)
    .maybeSingle();
  if (!row || row.status !== "pending") return;
  const hook: any = (row as any).wireline_webhooks;
  if (!hook || !hook.active) {
    // Hook was paused/deleted between enqueue and attempt; mark dead so
    // the operator can see + decide.
    await db.from("wireline_webhook_deliveries").update({
      status: "dead",
      last_error: "Webhook is paused or deleted.",
      attempts: (row.attempts || 0) + 1,
    }).eq("id", deliveryId);
    return;
  }

  const crypto = await import("node:crypto");
  const payloadStr = JSON.stringify(row.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Wireline-Webhooks/1.0",
    "X-Wireline-Event": row.event,
    "X-Wireline-Delivery": `whk_${row.id}`,
    "X-Wireline-Attempt": String((row.attempts || 0) + 1),
  };
  if (hook.secret) {
    const sig = crypto.createHmac("sha256", hook.secret).update(payloadStr).digest("hex");
    headers["X-Wireline-Signature"] = `sha256=${sig}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  const nowIso = new Date().toISOString();
  let statusCode: number | null = null;
  let errMsg: string | null = null;
  let ok = false;
  try {
    const r = await fetch(hook.url, { method: "POST", headers, body: payloadStr, signal: controller.signal });
    statusCode = r.status;
    ok = r.ok;
    if (!ok) errMsg = `HTTP ${r.status}`;
  } catch (err: any) {
    statusCode = 0;
    errMsg = err?.name === "AbortError" ? `Timed out after ${WEBHOOK_TIMEOUT_MS}ms` : (err?.message || String(err));
  } finally {
    clearTimeout(timer);
  }

  const newAttempts = (row.attempts || 0) + 1;
  if (ok) {
    await db.from("wireline_webhook_deliveries").update({
      status: "success",
      attempts: newAttempts,
      last_status_code: statusCode,
      last_error: null,
      delivered_at: nowIso,
    }).eq("id", deliveryId);
    await db.from("wireline_webhooks").update({
      last_triggered_at: nowIso,
      last_status: statusCode,
      last_error: null,
      delivery_count: ((hook.delivery_count as number) || 0) + 1,
    }).eq("id", hook.id);
    return;
  }

  // Failed — schedule a retry or mark dead.
  const max = row.max_attempts || WEBHOOK_DEFAULT_MAX_ATTEMPTS;
  const reachedDead = newAttempts >= max;
  const backoff = WEBHOOK_RETRY_BACKOFF_MS[Math.min(newAttempts - 1, WEBHOOK_RETRY_BACKOFF_MS.length - 1)];
  await db.from("wireline_webhook_deliveries").update({
    status: reachedDead ? "dead" : "pending",
    attempts: newAttempts,
    last_status_code: statusCode,
    last_error: errMsg,
    next_attempt_at: reachedDead ? null : new Date(Date.now() + backoff).toISOString(),
  }).eq("id", deliveryId);
  await db.from("wireline_webhooks").update({
    last_triggered_at: nowIso,
    last_status: statusCode,
    last_error: errMsg,
  }).eq("id", hook.id);
}

async function dispatchWebhook(userId: string, event: WebhookEvent, data: any) {
  try {
    const { data: hooks } = await db.from("wireline_webhooks")
      .select("id, events")
      .eq("user_id", userId)
      .eq("active", true);
    const targetIds = (hooks || [])
      .filter((h: any) => Array.isArray(h.events) && h.events.includes(event))
      .map((h: any) => h.id);
    if (!targetIds.length) return;

    const payload = { event, timestamp: new Date().toISOString(), data };
    const rows = targetIds.map((webhook_id: string) => ({
      user_id: userId,
      webhook_id,
      event,
      payload,
    }));
    const { data: inserted, error } = await db
      .from("wireline_webhook_deliveries")
      .insert(rows)
      .select("id");
    if (error) {
      console.error("Webhook delivery insert failed:", error);
      return;
    }
    // Fire the first attempt immediately, in parallel. Failures get
    // requeued by attemptWebhookDelivery itself; the background
    // scheduler picks them up once their backoff elapses.
    await Promise.all((inserted || []).map((d: any) => attemptWebhookDelivery(d.id)));
  } catch (err) {
    console.error("Webhook dispatch failed:", err);
  }
}

// ──────────────────────────────────────────────────────────────────
// Background retry scheduler — every 30s, claim and retry up to
// SCHED_BATCH pending deliveries whose next_attempt_at has elapsed.
// .unref() so it never blocks process exit. Wrapped in a re-entrancy
// guard so a slow batch never overlaps with itself.
// ──────────────────────────────────────────────────────────────────
const WEBHOOK_SCHED_INTERVAL_MS = 30_000;
const WEBHOOK_SCHED_BATCH = 25;
let _webhookSchedRunning = false;

async function processWebhookRetries() {
  if (_webhookSchedRunning) return;
  _webhookSchedRunning = true;
  try {
    const { data: due } = await db
      .from("wireline_webhook_deliveries")
      .select("id")
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .order("next_attempt_at", { ascending: true })
      .limit(WEBHOOK_SCHED_BATCH);
    if (!due?.length) return;
    // Run each delivery sequentially within the batch — keeps total
    // outbound concurrency bounded and the load on Supabase modest.
    for (const d of due) {
      try { await attemptWebhookDelivery(d.id); } catch (err) {
        console.error("Webhook retry attempt failed:", err);
      }
    }
  } catch (err) {
    console.error("Webhook scheduler tick failed:", err);
  } finally {
    _webhookSchedRunning = false;
  }
}
setInterval(processWebhookRetries, WEBHOOK_SCHED_INTERVAL_MS).unref?.();

// ────────────────────────────────────────────────────────────────────
//  SPEND BUDGETS — enforce monthly Claude limits and fire spend.*
//  webhook events when thresholds are crossed. Composed with the
//  audit log: month-to-date cost = SUM(cost_usd) over the current
//  UTC month for the user. Every Claude call funnels through the
//  audit middleware, which calls evaluateSpend() after the usage
//  rows are persisted. Hard-cap enforcement is a separate pre-handler
//  (enforceSpendCap) that short-circuits /api/claude/* with HTTP 402
//  when the user is both over budget and has hard_cap = true.
// ────────────────────────────────────────────────────────────────────

type BudgetCacheEntry = {
  fetchedAt: number;
  budget: { monthly_limit_usd: number; hard_cap: boolean; warn_threshold_pct: number; enabled: boolean } | null;
  mtdCost: number;
  period: string;
};
const BUDGET_CACHE_TTL_MS = 60_000;
const budgetCache = new Map<string, BudgetCacheEntry>();

function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodStartIso(period = currentPeriod()): string {
  // 'YYYY-MM' → UTC midnight of the 1st
  return new Date(`${period}-01T00:00:00.000Z`).toISOString();
}

async function getBudgetSnapshot(userId: string, force = false): Promise<BudgetCacheEntry> {
  const cached = budgetCache.get(userId);
  const period = currentPeriod();
  if (!force && cached && cached.period === period && Date.now() - cached.fetchedAt < BUDGET_CACHE_TTL_MS) {
    return cached;
  }
  const [{ data: budget }, { data: rows }] = await Promise.all([
    db.from("wireline_spend_budgets").select("monthly_limit_usd, hard_cap, warn_threshold_pct, enabled").eq("user_id", userId).maybeSingle(),
    db.from("wireline_audit_log").select("cost_usd").eq("user_id", userId).gte("created_at", periodStartIso(period)),
  ]);
  const mtdCost = (rows || []).reduce((s: number, r: any) => s + Number(r.cost_usd || 0), 0);
  const entry: BudgetCacheEntry = {
    fetchedAt: Date.now(),
    budget: budget
      ? {
          monthly_limit_usd: Number(budget.monthly_limit_usd || 0),
          hard_cap: !!budget.hard_cap,
          warn_threshold_pct: Number(budget.warn_threshold_pct || 80),
          enabled: budget.enabled !== false,
        }
      : null,
    mtdCost,
    period,
  };
  budgetCache.set(userId, entry);
  return entry;
}

function bumpBudgetCache(userId: string, deltaUsd: number) {
  const cached = budgetCache.get(userId);
  if (!cached) return;
  const period = currentPeriod();
  if (cached.period !== period) return;
  cached.mtdCost += deltaUsd;
}

/**
 * Fire spend.warning / spend.exceeded webhooks when thresholds cross.
 * Debounced via wireline_spend_alerts(unique user_id+period+threshold) —
 * each threshold fires at most once per period.
 */
async function evaluateSpend(userId: string, deltaUsd: number) {
  try {
    bumpBudgetCache(userId, deltaUsd);
    const snap = await getBudgetSnapshot(userId);
    if (!snap.budget || !snap.budget.enabled) return;
    const limit = snap.budget.monthly_limit_usd;
    if (!(limit > 0)) return;

    const pct = (snap.mtdCost / limit) * 100;
    const warnPct = Math.max(1, Math.min(99, snap.budget.warn_threshold_pct));
    const thresholdsToFire: { pct: number; event: WebhookEvent }[] = [];
    if (pct >= 100) thresholdsToFire.push({ pct: 100, event: "spend.exceeded" });
    if (pct >= warnPct) thresholdsToFire.push({ pct: warnPct, event: "spend.warning" });

    for (const t of thresholdsToFire) {
      // Debounce: insert (user, period, threshold) — duplicate row => already fired.
      const { error } = await db
        .from("wireline_spend_alerts")
        .insert({ user_id: userId, period: snap.period, threshold_pct: t.pct });
      if (error) continue; // unique-violation or insert error → skip silently
      await dispatchWebhook(userId, t.event, {
        period: snap.period,
        month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
        monthly_limit_usd: limit,
        threshold_pct: t.pct,
        percent_used: Number(pct.toFixed(1)),
        hard_cap: snap.budget.hard_cap,
        at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error("evaluateSpend failed:", err);
  }
}

/**
 * Pre-handler for /api/claude/* — block the request with HTTP 402 if the
 * user has a hard cap on and is at/over their monthly limit. Uses the
 * cached snapshot so this stays fast on the hot path.
 */
async function enforceSpendCap(req: any, res: any, next: any) {
  if (!req?.user?.id) return next();
  try {
    const snap = await getBudgetSnapshot(req.user.id);
    const b = snap.budget;
    if (b && b.enabled && b.hard_cap && b.monthly_limit_usd > 0 && snap.mtdCost >= b.monthly_limit_usd) {
      return res.status(402).json({
        error: `Monthly Claude budget reached ($${b.monthly_limit_usd.toFixed(2)}). Disable hard cap or raise the limit in Insights → AI Spend.`,
        code: "SPEND_LIMIT_EXCEEDED",
        period: snap.period,
        month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
        monthly_limit_usd: b.monthly_limit_usd,
      });
    }
  } catch (err) {
    // Fail-OPEN on transient DB errors: blocking everyone when Supabase
    // blips would be worse than briefly missing a hard cap. We log a
    // structured warning so operators can see when this fires.
    log.warn("enforceSpendCap check failed — allowing request through", {
      user_id: req?.user?.id,
      requestId: res.locals?.requestId,
      error: (err as any)?.message || String(err),
    });
  }
  next();
}

// ==========================================
// AUTH MIDDLEWARE
// ==========================================
async function authenticateUser(req: any, res: any, next: any) {
  // Idempotent: if an upstream middleware already authenticated this
  // request (e.g. the /api/claude scope runs auth before the spend cap
  // and audit middleware), skip the redundant Supabase round-trip.
  if (req.user?.id) return next();

  const authHeader = req.headers.authorization;
  if (!authHeader) {
     return res.status(401).json({ error: "No authorization header provided" });
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await db.auth.getUser(token);

  if (error || !user) {
     return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = user;
  next();
}

// ==========================================
// STRIPE WEBHOOK + sync helper
// ==========================================
//
// Mirrors the Stripe subscription into wireline_subscriptions AND keeps
// wireline_settings.subscription_status / max_agents in sync so every
// existing gate in the app keeps working. The Stripe row is the source
// of truth; this is a cache.
//
// Maps Stripe statuses to the legacy two-value gate Wireline already uses:
//   active | trialing      → subscription_status='active'
//   past_due | unpaid      → subscription_status='past_due'
//   canceled | incomplete* → subscription_status='canceled'
async function syncSubscriptionFromStripe(sub: Stripe.Subscription) {
  // Resolve the user via stripe_customer_id (set during checkout).
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const { data: existing } = await db.from("wireline_subscriptions")
    .select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  if (!existing?.user_id) {
    console.warn(`Stripe webhook: no wireline_subscriptions row for customer ${customerId}; skipping sync.`);
    return;
  }
  const userId = existing.user_id;
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id || null;
  const plan = planByPriceId(priceId);
  const stripeStatus = sub.status;
  const localStatus =
    stripeStatus === "active" || stripeStatus === "trialing" ? "active" :
    stripeStatus === "past_due" || stripeStatus === "unpaid" ? "past_due" :
    "canceled";

  // Mirror to wireline_subscriptions.
  await db.from("wireline_subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    plan: plan?.id || null,
    status: stripeStatus,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  // Sync the legacy gate so /api/outbound/dial, vapi-webhook, etc.
  // continue to work without touching them.
  const settingsPatch: any = { user_id: userId, subscription_status: localStatus };
  if (plan?.max_agents) settingsPatch.max_agents = plan.max_agents;
  await db.from("wireline_settings").upsert(settingsPatch, { onConflict: "user_id" });

  // Fan out to operator webhooks so external systems can react
  // (e.g. notify Slack on downgrade / cancellation).
  dispatchWebhook(userId, "subscription.changed", {
    plan: plan?.id || null,
    status: stripeStatus,
    legacy_status: localStatus,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString() : null,
    at: new Date().toISOString(),
  }).catch(() => {});
}

app.post("/api/stripe-webhook", async (req: any, res: any) => {
  if (!stripeAvailable() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Stripe webhook not configured." });
  }
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature header." });
  let event: Stripe.Event;
  try {
    // express.raw populated req.body as a Buffer — pass it through verbatim.
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    console.warn("Stripe webhook signature verification failed:", err?.message);
    return res.status(400).json({ error: `Webhook Error: ${err?.message}` });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        // First-ever subscription for this customer — pull the sub and sync.
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscriptionFromStripe(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await syncSubscriptionFromStripe(event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.payment_failed": {
        // Sub status will flip to past_due via the next subscription.updated;
        // we don't need a separate sync here.
        const inv = event.data.object as Stripe.Invoice;
        console.warn(`Stripe invoice payment failed for customer ${inv.customer}`);
        break;
      }
      default:
        // Many event types — ignore the noise.
        break;
    }
    res.json({ received: true });
  } catch (err: any) {
    console.error("Stripe webhook handler error:", err);
    res.status(500).json({ error: err?.message || "Webhook handler failed" });
  }
});

// ==========================================
// 1. VAPI WEBHOOK — system-to-system, signature-verified
// ==========================================
//
// Vapi delivers every webhook with the `serverUrlSecret` value we
// configured on the assistant (see line ~230) echoed back as a header.
// We compare in constant time. If VAPI_WEBHOOK_SECRET isn't set we log
// a one-time warning and allow the request — keeps local dev simple
// without leaving prod open.
//
// VAPI webhook secret — in production we REFUSE to use a default; the
// route handler returns 503 if VAPI_WEBHOOK_SECRET is unset, so we never
// silently accept unauthenticated webhooks. In dev we still default to
// a known value so local Vapi testing works without env juggling.
const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || (IS_PROD ? "" : "wireline-secret-key");
let _warnedAboutVapiSecret = false;

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

app.post("/api/vapi-webhook", async (req, res) => {
  // Vapi sends the secret back via one of these headers depending on
  // SDK version — accept either. The older `x-vapi-secret` and the
  // newer signature-style header. We're checking for the shared
  // secret echo, not an HMAC; that's what Vapi's serverUrlSecret
  // delivers.
  const provided =
    (req.headers["x-vapi-secret"] as string | undefined) ||
    (req.headers["x-vapi-signature"] as string | undefined) ||
    "";

  if (!process.env.VAPI_WEBHOOK_SECRET) {
    if (IS_PROD) {
      // Fail closed in production — refusing the webhook is safer than
      // accepting unauthenticated payloads that drive Vapi/LLM spend.
      log.error("VAPI_WEBHOOK_SECRET unset in production — rejecting webhook");
      return res.status(503).json({ error: "Webhook auth not configured." });
    }
    if (!_warnedAboutVapiSecret) {
      log.warn("VAPI_WEBHOOK_SECRET unset — accepting all webhook requests (dev only)");
      _warnedAboutVapiSecret = true;
    }
  } else if (!timingSafeEq(provided, VAPI_WEBHOOK_SECRET)) {
    log.warn("Rejected Vapi webhook with bad/missing signature", {
      requestId: res.locals?.requestId,
    });
    return res.status(401).json({ error: "Invalid webhook signature." });
  }

  const payload = req.body;
  const { message } = payload;

  console.log("--- INCOMING VAPI WEBHOOK ---");
  
  // For webhooks, we need to know WHICH user this is for.
  // We'll extract agentId from query and fetch the agent and its user_id.
  const webhookAgentId = req.query.agentId as string || "default-agent";
  
  // 0. Fetch the agent's owner and their settings
  const { data: agent } = await db.from('wireline_agents').select('user_id').eq('id', webhookAgentId).single();
  if (!agent) return res.status(404).json({ error: "Agent not found" });

  const { data: userSettings } = await db.from('wireline_settings')
    .select('subscription_status, voice_llm_provider, voice_llm_model')
    .eq('user_id', agent.user_id).single();
  const subscriptionStatus = userSettings?.subscription_status || 'active';
  const voiceLlmProvider = userSettings?.voice_llm_provider || 'google';
  const voiceLlmModel = userSettings?.voice_llm_model || 'gemini-1.5-flash';
  
  if (subscriptionStatus !== 'active') {
    console.log("Connection rejected: Account subscription is not active.");
    if (message && message.type === "assistant-request") {
        return res.json({
            assistant: {
                firstMessage: "We're sorry, but the automated service for this line is currently suspended. Please contact the administrator.",
                model: {
                    provider: "google",
                    model: "gemini-1.5-flash",
                    systemPrompt: "Tell the user the service is suspended, and gracefully end the call."
                }
            }
        });
    }
    return res.status(403).json({ error: "Access Denied: Inactive Subscription" });
  }
  
  // Vapi calls this prior to connecting the agent
  if (message && message.type === "assistant-request") {
    console.log("Assistant request received for Agent ID:", webhookAgentId);

    try {
      // 1. Assemble memory from Supabase
      const [agentConfig, directivesData, knowledgeData, personalityData, lessonsData] = await Promise.all([
        db.from('wireline_agents').select('*').eq('id', webhookAgentId).single(),
        db.from('wireline_directives').select('content, priority').eq('agent_id', webhookAgentId).order('priority', { ascending: false }),
        db.from('wireline_knowledge').select('content').eq('agent_id', webhookAgentId),
        db.from('wireline_personality').select('content').eq('agent_id', webhookAgentId).single(),
        db.from('wireline_agent_lessons').select('lesson').eq('agent_id', webhookAgentId).order('created_at', { ascending: false }).limit(3)
      ]);

      const lessons = (lessonsData?.data || []).map((l: any) => l.lesson).join('\n');


      // TEMPORAL AWARENESS: Inject exact current time so the agent knows what "Today" and "Tomorrow" mean
      const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

      // Determine Call Direction and Archetype Behavior
      const isOutbound = message.type === 'outboundPhoneCall' || message.call?.type === 'outboundPhoneCall';
      const customerNumber = message.call?.customer?.number;

      // 1.5. GET LEAD CONTEXT (OUTBOUND ONLY)
      let leadContext = "";
      if (isOutbound && customerNumber) {
         const { data: lead } = await db.from('wireline_outbound_leads')
            .select('context, customer_name')
            .eq('customer_number', customerNumber)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
         
         if (lead) {
            leadContext = `MISSION OBJECTIVE: You are calling ${lead.customer_name}. REASON FOR CALL: ${lead.context}`;
         }
      }

      // For outbound calls, derive the archetype from the agent's role rather than
      // forcing every outbound call to be a high-pressure closer. A collections
      // agent calling about a balance should not sound like a sales rep.
      const agentRole = agentConfig?.data?.role || DEFAULT_AGENT_ROLE;
      const OUTBOUND_ARCHETYPE_BY_ROLE: Record<string, string> = {
        sales:             'The Closer',
        lead_qualifier:    'The Closer',
        marketing:         'The Closer',
        customer_service:  'The Empath',
        technical_support: 'Support Tech',
        collections:       'The Collector',
        scheduler:         'Receptionist',
        receptionist:      'Receptionist',
      };
      const archetype = isOutbound
        ? (OUTBOUND_ARCHETYPE_BY_ROLE[agentRole] || 'The Closer')
        : (agentConfig?.data?.archetype || 'Receptionist');
      
      let archetypeRules = "";
      let llmTemp = 0.4;
      
      switch(archetype) {
         case 'The Closer':
            archetypeRules = "You are a consultative closer. Lead with discovery — uncover the prospect's pain before pitching. If a lead hesitates, ask an open-ended question to surface the real objection, then address it with evidence. Offer a concrete next step (demo, proposal, decision call) in every conversation.";
            llmTemp = 0.7;
            break;
         case 'Support Tech':
            archetypeRules = "You are highly analytical, patient, and precise. You ask clarifying troubleshooting questions one at a time. You do not rush. You summarize your findings before proposing a fix, and you verify the fix worked before closing.";
            llmTemp = 0.2;
            break;
         case 'The Empath':
            archetypeRules = "If a caller sounds frustrated, your first words must be a validating statement like 'I completely hear you, that's incredibly stressful. Let me fix this for you.' You acknowledge before you fix, always.";
            llmTemp = 0.6;
            break;
         case 'The Collector':
            archetypeRules = "You are firm, professional, and fully compliant with debt collection regulations. You always verify identity before discussing account details. You present the balance factually, listen to the customer's situation, and offer payment plan options before escalating. You never threaten, never harass, and document every promise made.";
            llmTemp = 0.3;
            break;
         default: // Receptionist
            archetypeRules = "You are an expert at handling phone calls where people are often in a hurry. Never use platitudes like 'I hope you're having a wonderful day.' Get straight to the value. You are cheerful, polite, and highly efficient.";
            llmTemp = 0.4;
      }

      const ambientNoiseActive = agentConfig?.data?.ambient_noise && agentConfig?.data?.ambient_noise !== 'off';
      const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[agentRole] || "";

      const systemPrompt = `
      ## BLOCK 1: IDENTITY & ARCHETYPE (THE "MOAT")
      Persona: You are ${agentConfig?.data?.name || 'Wireline Agent'}, a representative for our company.
      Role: ${agentRole.replace(/_/g, ' ').toUpperCase()}
      Tone: Snappy, concise, low-friction.
      The "Secret Sauce": ${archetypeRules}
      Base Personality: ${personalityData?.data?.content || "You are a professional, helpful assistant."}
      ${ambientNoiseActive ? "Ambient Realism: You are working in a busy location. Speak with a slight sense of professional urgency." : ""}
      
      ${leadContext ? `## CRITICAL: CURRENT MISSION CONTEXT\n${leadContext}` : ""}

      ${agentConfig?.data?.website_url ? `## KNOWLEDGE GROUNDING\nYour company's official website is: ${agentConfig.data.website_url}. If asked for more details or deep info not in your knowledge base, refer them back to the site.` : ""}
      
      ${lessons ? `## RECENT LESSONS LEARNED (IMPROVEMENTS)\nApply these tactical adjustments derived from your previous calls:\n${lessons}` : ""}

      ${roleProtocol}

      ## HALLUCINATION GUARD & FALLBACK
      If a customer asks a question you do not have the answer to in the Knowledge Base below:
      1. ACKNOWLEDGE: "That's a great question, let me check with our experts."
      2. RESOLVE: "Let me have a specialist review that and get back to you. What's your email?"
      3. LOG: After getting the info, move on. NEVER guess or make up prices, dates, or company policies.

      ## BLOCK 2: TEMPORAL & CONTEXTUAL ANCHORS
      You unmistakably know that today is ${currentDateTime} (Eastern Time). If a customer asks for "tomorrow" or "next week", calculate the date silently and confirm it back to them (e.g., "So that would be Tuesday the 24th at 2pm?").

      Memory Protocol: If a customer context seems familiar or they mention a previous conversation, you MUST use the 'view_recent_interactions' tool to retrieve their history and provide a personalized experience.

      ## BLOCK 3: CONVERSATIONAL LOOP & GUARDRAILS
      Response Length: Keep responses conversational — aim for 20 words or fewer. Go up to 40 words only when confirming multi-step details like a full appointment (date, time, and service). Never monologue.
      The "Anti-Echo" Rule: Do not repeat back what the user just said.
      Question Limit: Never ask more than one question at a time.
      Number Formatting: Spell out important numbers if they sound robotic (e.g., "Two zero two" instead of "Two hundred and two").

      ## BLOCK 4: TOOL EXECUTION LOGIC & PROTOCOLS
      Escalation Detection (CRITICAL):
      You must proactively escalate to a human using the 'escalate_to_human' tool if:
      1. Potential Conflict: The customer starts using profanity or sounds clearly distressed.
      2. High stakes: The customer is asking for a quote over $5,000 or wants to discuss a legal liability.
      3. Repetition: You have had to repeat the same answer three times without resolution.
      
      Sequence Requirements:
      1. If a user wants a slot, you MUST check calendar availability first.
      2. If the slot is open, book the appointment.
      3. Confirm the Reference ID provided by the system before hanging up.
      
      Escalation Transfer Rule: If a user asks for a "real person" twice, or asks to transfer, immediately inform them you are transferring them and use the tools.

      # CROSS-CHANNEL HANDOFF (OMNICHANNEL)
      If a customer needs a detailed follow-up, a reminder, or a document sent that you cannot speak entirely over the phone, use the 'send_email' tool. 
      Tell the caller: "I'll hand this over to our email team to send you that info right now."

      ## ABSOLUTE RULES
      ${(directivesData?.data || []).map((d: any) => `[PRIORITY ${d.priority}] ${d.content}`).join('\n')}
      
      ## KNOWLEDGE BASE
      ${(knowledgeData?.data || []).map((k: any) => `- ${k.content}`).join('\n')}
      `;

      const responsePayload = {
        assistant: {
          name: agentConfig?.data?.name || "Wireline Agent",
          firstMessage: agentConfig?.data?.first_message || "Hello! Thank you for calling. How can I help you today?",
          serverUrlSecret: "wireline-secret-key",
          serverMessages: ["tool-calls", "status-update", "conversation-update", "end-of-call-report"],
          backgroundSound: agentConfig?.data?.ambient_noise || 'off',
          // Per-user voice LLM choice (defaults to Gemini Flash for backward
          // compat). Operators set this in Core Settings — pick "anthropic"
          // and a Claude model Vapi supports (e.g. claude-3-5-sonnet-20241022)
          // to route the voice agent through Claude.
          model: {
            provider: voiceLlmProvider,
            model: voiceLlmModel,
            systemPrompt: systemPrompt,
            temperature: llmTemp,
          },
          recordingEnabled: true,
          voice: {
            provider: isOutbound ? (agentConfig?.data?.voice_provider_outbound || agentConfig?.data?.voice_provider || "11labs") : (agentConfig?.data?.voice_provider_inbound || agentConfig?.data?.voice_provider || "11labs"),
            voiceId: isOutbound ? (agentConfig?.data?.voice_id_outbound || agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o") : (agentConfig?.data?.voice_id_inbound || agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o") 
          },
          functions: [
            {
              name: "check_calendar_availability",
              description: "Checks the database calendar to see what times are already booked on a specific date. ALWAYS run this before confirming an appointment to prevent double-booking.",
              parameters: {
                type: "object",
                properties: {
                  date: { type: "string", description: "The date to check (e.g., 'October 15', 'Next Tuesday')." }
                },
                required: ["date"]
              }
            },
            {
              name: "book_appointment",
              description: "Books an appointment in the calendar. Use this only AFTER checking the calendar to ensure the time is free.",
              parameters: {
                type: "object",
                properties: {
                  date: { type: "string", description: "The date of the appointment (e.g., 'Tuesday', 'Oct 15')" },
                  time: { type: "string", description: "The time of the appointment (e.g., '2 PM')" },
                  customer_name: { type: "string", description: "The caller's name" },
                  service_type: { type: "string", description: "The type of service requested (e.g., 'AC Repair', 'Plumbing')" }
                },
                required: ["date", "time", "customer_name", "service_type"]
              }
            },
            {
              name: "escalate_to_human",
              description: "Transfers the call to a real human manager. Use this if the customer is very angry, asks for a human repeatedly, or has an extremely complex question you cannot answer with your Knowledge Base.",
              parameters: { type: "object", properties: {}, required: [] }
            },
            {
              name: "send_email",
              description: "Sends an email to the customer. Use this to send confirmations, quotes, or follow-up information during or after the call.",
              parameters: {
                type: "object",
                properties: {
                  to_email: { type: "string", description: "The customer's email address." },
                  subject: { type: "string", description: "The subject of the email." },
                  body: { type: "string", description: "The body content of the email." }
                },
                required: ["to_email", "subject", "body"]
              }
            },
            {
              name: "create_fleet_task",
              description: "Creates a resolution mission for a human agent. Use this if a customer needs something complex that you cannot handle on the call.",
              parameters: {
                type: "object",
                properties: {
                  description: { type: "string", description: "Detailed description of the task." },
                  priority: { type: "string", enum: ["low", "medium", "high"], description: "The urgency of the mission." }
                },
                required: ["description", "priority"]
              }
            },
            {
              name: "search_leads",
              description: "Locates customer lead data from the central fleet intelligence database. Use this to find existing lead context.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "The name or signal signature to search for." }
                },
                required: ["query"]
              }
            },
            {
              name: "view_recent_interactions",
              description: "Retrieves recent tasks and call summaries for this specific number. Use this to provide continuity if a caller asks about previous status.",
              parameters: {
                type: "object",
                properties: {},
                required: []
              }
            }
          ]
        }
      };

      console.log("Replied with assistant config successfully.");
      return res.json(responsePayload);
    } catch (e) {
      console.error("Vapi webhook config error:", e);
      // Give Vapi a graceful fallback so it doesn't freeze
      return res.json({
         assistant: {
           firstMessage: "I'm sorry, my memory banks are currently offline.",
           model: { provider: "google", model: "gemini-1.5-flash", systemPrompt: "Apologize and hang up." }
         }
      });
    }
  }
  
  if (message && message.type === "tool-calls") {
    console.log("Received tool call:", JSON.stringify(message.toolCalls, null, 2));
    
    // Fetch agent config once for all tools in this call
    const { data: agent } = await db.from('wireline_agents').select('*').eq('id', webhookAgentId).single();

    const results = [];
    
    for (const toolCall of message.toolCalls) {
      
      // TOOL 0: CONTEXTUAL RECALL (MEMORY)
      if (toolCall.function.name === "view_recent_interactions") {
         try {
            const customerPhone = payload.call?.customer?.number || message.call?.customer?.number || "unknown";
            
            log.debug("[MEMORY] Fetching history", { customerPhone });

            // Sanitize the phone number before using it in LIKE patterns.
            // Vapi delivers phone numbers in E.164 format (+15551234567), so only
            // digits and the leading '+' are valid. Stripping anything else also
            // prevents LIKE wildcard characters (% _) from manipulating the query.
            const safePhone = customerPhone.replace(/[^0-9+]/g, '').slice(0, 20);

            // 1. Fetch last 3 call summaries
            const { data: pastCalls } = await db.from('wireline_call_logs')
               .select('summary, intent_label, created_at')
               .eq('customer_number', customerPhone)
               .order('created_at', { ascending: false })
               .limit(3);

            // 2. Fetch any open tasks mentioning this customer's phone number.
            //    Tasks are linked by description (which includes the phone) or by the
            //    customer_info JSONB phone field — not by email, since we only have a
            //    phone number here.
            const { data: tasks } = safePhone
               ? await db.from('wireline_fleet_tasks')
                  .select('description, status, priority')
                  .eq('user_id', agent?.user_id)
                  .or(`description.ilike.%${safePhone}%,customer_info->>phone.ilike.%${safePhone}%`)
                  .eq('status', 'pending')
                  .limit(2)
               : { data: [] };

            let contextReport = `RECENT CONTEXT FOR ${customerPhone}:\n`;
            if (pastCalls && pastCalls.length > 0) {
               contextReport += "PAST CALL HISTORY:\n" + pastCalls.map(c => `- [${new Date(c.created_at).toLocaleDateString()}] Intent: ${c.intent_label || 'Inquiry'}. Summary: ${c.summary}`).join('\n');
            } else {
               contextReport += "No previous voice interaction history found.\n";
            }

            if (tasks && tasks.length > 0) {
               contextReport += "\nACTIVE MISSIONS/TASKS:\n" + tasks.map(t => `- [${t.priority.toUpperCase()}] ${t.description} (Status: ${t.status})`).join('\n');
            }

            results.push({
              toolCallId: toolCall.id,
              result: contextReport || "No interaction signals found in the neural cache."
            });
            continue;
         } catch (e) {
            console.error("Recall Error:", e);
            results.push({ toolCallId: toolCall.id, result: "Memory retrieval error. Process caller as a new contact for safety." });
            continue;
         }
      }
      
      // TOOL 1: CHECK AVAILABILITY
      if (toolCall.function.name === "check_calendar_availability") {
         try {
            const { date } = toolCall.function.arguments;
            // Sanitize the date string so LIKE wildcards (% _) from the LLM
            // cannot manipulate the query pattern. Keep only characters that
            // appear in natural date expressions (letters, digits, spaces,
            // commas, slashes, hyphens, periods).
            const safeDate = String(date || '').replace(/[^A-Za-z0-9 ,\/\-\.]/g, '').slice(0, 60);
            if (!safeDate) {
              results.push({ toolCallId: toolCall.id, result: "No date provided. Please ask the customer which date they need." });
              continue;
            }
            // Scope to this agent's bookings so cross-operator calendar isolation is preserved.
            const { data, error } = await db.from('wireline_appointments')
              .select('time, service_type')
              .ilike('date', `%${safeDate}%`)
              .eq('user_id', agent?.user_id);
            
            if (error) throw error;

            if (data && data.length > 0) {
               const bookedTimes = data.map(appt => appt.time).join(", ");
               results.push({
                 toolCallId: toolCall.id,
                 result: `The following times are already booked on ${safeDate}: ${bookedTimes}. Please tell the customer these times are unavailable and offer them any other time.`
               });
            } else {
               results.push({
                 toolCallId: toolCall.id,
                 result: `The entire day on ${safeDate} is completely open. You can offer them any time during normal business hours.`
               });
            }
         } catch (e) {
            results.push({ toolCallId: toolCall.id, result: "Cannot access calendar. Assume open for now but warn customer it is pending." });
         }
      }

      // TOOL 2: BOOK APPOINTMENT
      if (toolCall.function.name === "book_appointment") {
        try {
          const args = toolCall.function.arguments; 
          
          // Insert actual appointment into Supabase
          const { data, error } = await db.from('wireline_appointments').insert({
            agent_id: webhookAgentId,
            user_id: agent?.user_id,
            call_id: message.call?.id || "in-call",
            date: args.date || "Unknown Date",
            time: args.time || "Unknown Time",
            customer_name: args.customer_name || "Guest",
            service_type: args.service_type || "General Service",
            status: "Scheduled"
          }).select('id').single();

          if (error) throw error;

          results.push({
            toolCallId: toolCall.id,
            result: `Appointment confirmed successfully! Your booking reference ID is ${data.id.split('-')[0]}.`
          });
        } catch (e) {
          console.error("Failed to book appointment:", e);
          results.push({
            toolCallId: toolCall.id,
            result: "I'm sorry, I'm having trouble accessing the calendar database right now."
          });
        }
      }

      // TOOL 3: ESCALATE TO HUMAN
      if (toolCall.function.name === "escalate_to_human") {
         const dest = agent?.transfer_phone || "the front office";
         results.push({
           toolCallId: toolCall.id,
           result: `Please say: 'I am transferring you to ${dest} now, please hold on.' Then, simulate the hold process.`
         });
      }

      // TOOL 4: ROUTING HANDOFF (PHONE -> EMAIL)
      if (toolCall.function.name === "send_email") {
         try {
           const { to_email, subject, body } = toolCall.function.arguments;
           
           // Fetch the first connected valid email account
           const { data: accounts } = await db.from('wireline_email_accounts').select('*').limit(1);
           
           if (!accounts || accounts.length === 0) {
              results.push({
                toolCallId: toolCall.id,
                result: "Email system is not connected to any inbox. Inform the customer."
              });
              continue;
           }

           const account = accounts[0];
           const curAgentId = webhookAgentId || "default-agent";

           // Create a Fleet Handoff Task (For traceability & Founder monitoring)
           const { data: task, error: taskError } = await db.from('wireline_fleet_tasks').insert({
              source_type: 'phone_call',
              source_id: message.call?.id || "manual-handoff",
              target_channel: 'email',
              agent_id: curAgentId,
              customer_info: { email: to_email },
              task_type: 'follow_up',
              description: `Subject: ${subject}\n\n${body}`,
              status: 'processing'
           }).select('*').single();

           if (taskError) throw taskError;

           const oauth2Client = getGoogleOAuthClient(req);
           oauth2Client.setCredentials({
             access_token: account.access_token,
             refresh_token: account.refresh_token,
             expiry_date: account.expires_at
           });

           const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
           const messageParts = [
             `To: ${to_email}`,
             `Subject: ${subject}`,
             'Content-Type: text/plain; charset=utf-8',
             '',
             body
           ];
           const encodedMessage = Buffer.from(messageParts.join('\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
           
           const gmailRes = await gmail.users.messages.send({
             userId: 'me',
             requestBody: { raw: encodedMessage }
           });

           // OMNICHANNEL SYNC: Log the phone-originated email to the hub
           try {
              const googleThreadId = gmailRes.data.threadId;
              let { data: thread } = await db.from('wireline_email_threads').select('*').eq('thread_id', googleThreadId).single();
              
              if (!thread) {
                 const { data: newThread } = await db.from('wireline_email_threads').insert({
                   account_id: account.id,
                   thread_id: googleThreadId,
                   customer_email: to_email,
                   subject: subject,
                   status: 'open',
                   summary: `Phone Follow-up: ${to_email}`
                 }).select('*').single();
                 thread = newThread;
              }

              await db.from('wireline_email_messages').insert({
                 thread_id: thread.id,
                 google_message_id: gmailRes.data.id,
                 role: 'ai',
                 content: body
              });

              await db.from('wireline_email_threads').update({
                 last_message_at: new Date()
              }).eq('id', thread.id);
           } catch(syncErr) {
              console.error("Omnichannel sync error:", syncErr);
           }

           // Mark task as completed
           await db.from('wireline_fleet_tasks').update({ status: 'completed' }).eq('id', task.id);

           results.push({
             toolCallId: toolCall.id,
             result: `Successfully handed off follow-up task to the AI Email Fleet. Task ID: ${task.id.split('-')[0]}. The email has been dispatched via your connected mailroom.`
           });
         } catch (e: any) {
           console.error("Fleet Handoff Failed:", e);
           results.push({
             toolCallId: toolCall.id,
             result: "Handoff to email system failed. Please take a manual note."
           });
         }
      }

      // TOOL 5: FLEET TASK
      if (toolCall.function.name === "create_fleet_task") {
        try {
           const { description, priority } = toolCall.function.arguments;
           const { data: task, error: taskError } = await db.from('wireline_fleet_tasks').insert({
              user_id: agent?.user_id,
              agent_id: agent?.id,
              description,
              priority: priority || 'medium',
              status: 'pending',
              source: 'voice'
           }).select('id').single();
           
           if (taskError) throw taskError;
           results.push({ toolCallId: toolCall.id, result: `Task ${task.id.split('-')[0]} created in mission queue.` });
        } catch (e) {
           results.push({ toolCallId: toolCall.id, result: "Failed to create task in mission queue." });
        }
      }

      // TOOL 6: SEARCH LEADS
      if (toolCall.function.name === "search_leads") {
        try {
           const { query } = toolCall.function.arguments;
           const { data: leads } = await db.from('wireline_outbound_leads')
             .select('name, status, last_contact_summary')
             .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
             .limit(3);
           
           if (leads && leads.length > 0) {
              results.push({ toolCallId: toolCall.id, result: `Found matching intelligence: ${leads.map(l => `${l.name} (${l.status}): ${l.last_contact_summary || 'No prior notes'}`).join('; ')}` });
           } else {
              results.push({ toolCallId: toolCall.id, result: "No matching lead profiles found in current sector." });
           }
        } catch (e) {
           results.push({ toolCallId: toolCall.id, result: "Intelligence database is currently unreachable." });
        }
      }
    }
    
    res.json({ results });
    return;
  }
  
  // REAL-TIME SIGNAL TRACKING
  if (message && message.type === "status-update") {
     const callId = payload.call?.id;
     // Note: Vapi status can be 'queued', 'ringing', 'in-progress', 'ended'
     const status = message.status || payload.call?.status;
     
     if (callId) {
        if (status === 'in-progress' || status === 'ringing' || status === 'queued') {
           await db.from('wireline_signal_presence').upsert({
              id: callId,
              user_id: agent?.user_id,
              agent_id: webhookAgentId,
              customer_number: payload.call?.customer?.number || "Unknown",
              status: status,
              started_at: new Date().toISOString()
           });
        } else if (status === 'ended' || status === 'completed') {
           await db.from('wireline_signal_presence').delete().eq('id', callId);
        }
     }
  }

  if (message && message.type === "end-of-call-report") {
    console.log("Call ended, report received!");
    
    try {
        const call = message.call;
        const analysis = message.analysis;
        
        let duration = 0;
        if (call?.endedAt && call?.startedAt) {
           duration = Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000);
        }

        await db.from('wireline_call_logs').insert({
           vapi_call_id: call?.id || "unknown",
           agent_id: webhookAgentId,
           direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
           customer_number: call?.customer?.number || "",
           duration_seconds: duration,
           cost: call?.cost || 0.0,
           summary: analysis?.summary || "No summary provided.",
           transcript: message.transcript || "",
           recording_url: message.recordingUrl || message.stereoRecordingUrl || null
        });

        // ────────────────────────────────────────────────────────────
        //  POST-CALL ENRICHMENT
        //
        //  Preferred: single-pass Claude analysis (one tool-call returning
        //  score + intent + sentiment + lesson + action items + compliance
        //  flags + knowledge gaps). Falls back to the legacy 3-Gemini-call
        //  pipeline when ANTHROPIC_API_KEY is not set or the Claude call
        //  fails for any reason — the agents keep working either way.
        // ────────────────────────────────────────────────────────────
        let claudeAnalysisDone = false;
        if (claudeBrain.isClaudeAvailable() && message.transcript) {
          try {
            const { data: agentDetail } = await db
              .from('wireline_agents')
              .select('name, archetype, role')
              .eq('id', webhookAgentId)
              .single();

            const result = await claudeBrain.postCallAnalysis({
              agentName: agentDetail?.name || 'Wireline Agent',
              archetype: agentDetail?.archetype || 'Receptionist',
              role: agentDetail?.role || undefined,
              customerNumber: call?.customer?.number,
              durationSeconds: duration,
              summary: analysis?.summary || '',
              transcript: message.transcript || '',
            });

            // 1. Persist lead score + intent + sentiment + coaching note
            await db.from('wireline_call_logs').update({
              lead_score: result.lead_score,
              intent_label: result.intent_label,
              sentiment: result.sentiment,
              coaching_note: result.coaching_note,
            }).eq('vapi_call_id', call?.id);

            // 2. Promote a single tactical lesson (if any).
            if (result.lesson && result.lesson.trim().length > 0) {
              await db.from('wireline_agent_lessons').insert({
                agent_id: webhookAgentId,
                user_id: agent?.user_id,
                lesson: result.lesson.trim(),
              });
            }

            // 3. Insert ALL action items as fleet tasks.
            for (const item of result.action_items || []) {
              await db.from('wireline_fleet_tasks').insert({
                user_id: agent?.user_id,
                task_type: 'action_required',
                description: `Follow-up for ${call?.customer?.number || 'Caller'}: ${item.description}`,
                source_type: 'phone_call',
                source_id: call?.id,
                target_channel: item.target_channel || 'manual',
                priority: item.priority || 'medium',
                status: 'pending',
              });
            }

            // 4. Surface knowledge gaps as low-priority lessons (clearly tagged so
            //    they're easy to filter / promote into wireline_knowledge later).
            for (const gap of result.knowledge_gaps || []) {
              await db.from('wireline_agent_lessons').insert({
                agent_id: webhookAgentId,
                user_id: agent?.user_id,
                lesson: `[KNOWLEDGE GAP] ${gap}`,
              });
            }

            // 5. Surface compliance flags as critical fleet tasks.
            for (const flag of result.compliance_flags || []) {
              await db.from('wireline_fleet_tasks').insert({
                user_id: agent?.user_id,
                task_type: 'compliance_review',
                description: `[COMPLIANCE] Call ${call?.id?.slice(0, 8) || ''} — ${flag}`,
                source_type: 'phone_call',
                source_id: call?.id,
                target_channel: 'manual',
                priority: 'high',
                status: 'pending',
              });
            }

            // 6. Update outbound lead status if applicable.
            await db.from('wireline_outbound_leads').update({
              status: 'Completed',
              last_called_at: new Date(),
            }).eq('call_id', call?.id);

            // 7. Outbound webhook events
            const callPayload = {
              call_id: call?.id,
              customer_number: call?.customer?.number,
              direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
              duration_seconds: duration,
              cost: call?.cost,
              lead_score: result.lead_score,
              intent_label: result.intent_label,
              sentiment: result.sentiment,
              summary: analysis?.summary,
              agent_id: webhookAgentId,
            };
            const logWebhookFailure = (event: string) => (err: unknown) =>
              log.warn("webhook dispatch failed", { event, error: (err as any)?.message || String(err) });
            dispatchWebhook(agent?.user_id, "call.completed", callPayload).catch(logWebhookFailure("call.completed"));
            if (result.intent_label === "high" || result.lead_score >= 70) {
              dispatchWebhook(agent?.user_id, "lead.hot", callPayload).catch(logWebhookFailure("lead.hot"));
            }
            if (result.sentiment === "angry" || (result.compliance_flags?.length ?? 0) > 0) {
              dispatchWebhook(agent?.user_id, "call.escalated", callPayload).catch(logWebhookFailure("call.escalated"));
            }
            for (const flag of result.compliance_flags || []) {
              dispatchWebhook(agent?.user_id, "compliance.flagged", { ...callPayload, flag }).catch(logWebhookFailure("compliance.flagged"));
            }

            claudeAnalysisDone = true;
          } catch (err) {
            console.error('Claude post-call analysis failed; falling back to Gemini:', err);
          }
        }

        // Legacy Gemini pipeline — runs only if Claude wasn't available or failed.
        if (!claudeAnalysisDone) {
          const scoringPrompt = `
            Analyze this call TRANSCRIPT and give a BUYING INTENT score (0-100) and CATEGORY ('high', 'medium', 'low', 'none').
            Transcript: ${message.transcript || "None"}
            Summary: ${analysis?.summary || ""}
            RESPONSE FORMAT (JSON): { "score": number, "label": string }
          `;
          try {
             const model = genAI.getGenerativeModel({
               model: "gemini-1.5-flash",
               generationConfig: { responseMimeType: "application/json" }
             });
             const scoreRes = await model.generateContent(scoringPrompt);
             const scoreObj = JSON.parse(scoreRes.response.text() || "{}");
             await db.from('wireline_call_logs').update({
               lead_score: scoreObj.score || 0,
               intent_label: scoreObj.label || 'none'
             }).eq('vapi_call_id', call?.id);

             await db.from('wireline_outbound_leads').update({
               status: "Completed",
               last_called_at: new Date()
             }).eq('call_id', call?.id);

             try {
                const lessonPrompt = `Identify exactly ONE tactical improvement for this agent. JSON ONLY: { "lesson": "string" }. Transcript: ${message.transcript}`;
                const lessonModel = genAI.getGenerativeModel({
                   model: "gemini-1.5-flash",
                   generationConfig: { responseMimeType: "application/json" }
                });
                const lessonRes = await lessonModel.generateContent(lessonPrompt);
                const lessonObj = JSON.parse(lessonRes.response.text() || "{}");
                if (lessonObj.lesson) {
                   await db.from('wireline_agent_lessons').insert({
                      agent_id: webhookAgentId,
                      user_id: agent?.user_id,
                      lesson: lessonObj.lesson
                   });
                }
             } catch(e) {}

             try {
                const taskPrompt = `Based on the transcript, did the agent promise any follow-up (like sending an email, checking a quote), or did the human ask for something out-of-scope?
                JSON format MUST match exactly: { "has_task": boolean, "task_description": "string", "priority": "high" | "medium" | "low", "target_channel": "email" | "manual" }
                Transcript: ${message.transcript}`;
                const taskModel = genAI.getGenerativeModel({
                   model: "gemini-1.5-flash",
                   generationConfig: { responseMimeType: "application/json" }
                });
                const taskRes = await taskModel.generateContent(taskPrompt);
                const taskObj = JSON.parse(taskRes.response.text() || "{}");
                if (taskObj.has_task && taskObj.task_description) {
                   await db.from('wireline_fleet_tasks').insert({
                      user_id: agent?.user_id,
                      task_type: 'action_required',
                      description: `FOLLOW-UP FOR ${call?.customer?.number || 'Caller'}: ${taskObj.task_description}`,
                      source_type: 'phone_call',
                      source_id: call?.id,
                      target_channel: taskObj.target_channel || 'manual',
                      priority: taskObj.priority || 'medium',
                      status: 'pending'
                   });
                }
             } catch(e) {}
          } catch(scoringErr) {
             console.error("Call scoring failed:", scoringErr);
          }
        }
        
        // If it was outbound, let's update the lead status
        if (call?.type === "outboundPhoneCall") {
           await db.from('wireline_outbound_leads')
             .update({ status: 'Completed' })
             .eq('call_id', call?.id);
        }

        return res.json({ success: true });
    } catch(e) {
      console.error("Failed to save call log", e);
      return res.json({ success: false });
    }
  }

  res.json({ status: "ok" });
});

// ==========================================
// 1.5 CALL LOG RETRIEVAL ENDPOINT
// ==========================================
app.get("/api/calls", authenticateUser, async (req: any, res: any) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const { data: calls, error, count } = await db
      .from('wireline_call_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
      
    if (error) throw error;
    res.json({ 
       calls: calls || [],
       hasMore: count ? (offset + limit) < count : false,
       total: count || 0
    });
  } catch (error) {
    console.error("Failed to fetch calls:", error);
    res.json({ calls: [], hasMore: false, total: 0 }); // Fail gracefully if table not created
  }
});

// ==========================================
// 1.8 DASHBOARD STATS ENDPOINT
// ==========================================
app.get("/api/dashboard/stats", authenticateUser, async (req: any, res: any) => {
   try {
      const [apptRes, leadsRes, logsRes] = await Promise.all([
          db.from('wireline_appointments').select('id', { count: 'exact' }).eq('user_id', req.user.id),
          db.from('wireline_outbound_leads').select('id', { count: 'exact' }).eq('user_id', req.user.id),
          db.from('wireline_call_logs').select('cost, duration_seconds, direction, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(200)
      ]);
      
      const totalAppointments = apptRes.count || 0;
      const totalLeads = leadsRes.count || 0;
      const logs = logsRes.data || [];
      
      const totalMinutes = Math.ceil(logs.reduce((acc, log) => acc + (log.duration_seconds || 0), 0) / 60);
      const totalCost = logs.reduce((acc, log) => acc + (Number(log.cost) || 0), 0);
      const inboundCount = logs.filter(l => l.direction === 'inbound').length;
      const outboundCount = logs.filter(l => l.direction === 'outbound').length;
      const conversionRate = logs.length > 0 ? ((totalAppointments / logs.length) * 100).toFixed(1) : 0;

      // FETCH "HOT LEADS" (AI-Scored High Intent)
      const { data: hotCalls } = await db.from('wireline_call_logs').select('*').eq('user_id', req.user.id).gte('lead_score', 75).order('created_at', { ascending: false }).limit(5);
      const { data: hotEmails } = await db.from('wireline_email_threads').select('*').eq('user_id', req.user.id).gte('lead_score', 75).order('created_at', { ascending: false }).limit(5);

      const hotLeads = [
        ...(hotCalls || []).map(c => ({ id: c.id, type: 'call', contact: c.customer_number, score: c.lead_score, intent: c.intent_label, summary: c.summary, date: c.created_at })),
        ...(hotEmails || []).map(e => ({ id: e.id, type: 'email', contact: e.customer_email, score: e.lead_score, intent: e.intent_label, summary: e.summary, date: e.created_at }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);

      // Compute Chart Data (Last 7 Days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
         const d = new Date();
         d.setDate(d.getDate() - (6 - i));
         return d.toISOString().split('T')[0];
      });

      const chartDataMap: Record<string, { signals: number, leads: number }> = {};
      last7Days.forEach(dateStr => {
         chartDataMap[dateStr] = { signals: 0, leads: 0 };
      });

      logs.forEach((log: any) => {
         const d = new Date(log.created_at).toISOString().split('T')[0];
         if (chartDataMap[d]) {
             chartDataMap[d].signals += 1;
         }
      });

      const { data: recentAppts } = await db.from('wireline_appointments').select('created_at').eq('user_id', req.user.id);
      (recentAppts || []).forEach((appt: any) => {
         const d = new Date(appt.created_at).toISOString().split('T')[0];
         if (chartDataMap[d]) {
             chartDataMap[d].leads += 1;
         }
      });

      const chartData = last7Days.map(dateStr => {
         const date = new Date(dateStr + "T12:00:00");
         return {
            name: date.toLocaleDateString('en-US', { weekday: 'short' }),
            signals: chartDataMap[dateStr].signals,
            leads: chartDataMap[dateStr].leads
         };
      });

      res.json({
         totalAppointments,
         totalLeads,
         totalCalls: logs.length,
         totalMinutes,
         totalCost: totalCost.toFixed(2),
         inboundCount,
         outboundCount,
         conversionRate,
         recentLogs: logs.slice(0, 100),
         hotLeads,
         chartData
      });
   } catch(e) {
      console.error("Dashboard error", e);
      res.status(500).json({ error: "Failed to fetch stats" });
   }
});

// ==========================================
// 1.6 APPOINTMENTS RETRIEVAL ENDPOINT
// ==========================================
app.get("/api/appointments", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: appointments, error } = await db
      .from('wireline_appointments')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    res.json({ appointments: appointments || [] });
  } catch (error) {
    console.error("Failed to fetch appointments:", error);
    res.json({ appointments: [] }); 
  }
});

// ==========================================
// 1.7 AGENTS MANAGEMENT ENDPOINTS
// ==========================================

// Role personality templates — production-grade system prompts for each
// business function. These are applied when an agent is created or when
// the operator clicks "Apply Role Template" in Fleet Settings.
const ROLE_PERSONALITY_TEMPLATES: Record<string, string> = {
  sales: `You are an elite consultative sales agent. Your mission is to guide prospects through a natural buying conversation and close with confidence. You open with a value-anchored discovery question, not a pitch. You listen actively, mirror back what you heard, and build genuine rapport before presenting any solution. You handle objections with empathy and evidence — "That's a fair concern; here's what others in your position found..." — and you never manufacture urgency. You always push toward a concrete next step: a demo, a proposal, or a decision call. You know your product inside and out and never lie about pricing or capabilities. You are persistent without being pushy. When you sense hesitation, you name it and address it directly. Your tone is energetic, warm, and professional.`,

  customer_service: `You are a world-class customer service agent. Your top priority is making every customer feel genuinely heard, valued, and completely resolved. You lead with empathy — acknowledge before you fix. Repeat back what you heard to confirm understanding before proposing a solution. You work efficiently and escalate only when you have truly exhausted your options. You remain calm under pressure, avoid scripted or robotic language, and turn frustrated customers into loyal advocates. You keep every promise you make during the call and follow through on every commitment. If you can't resolve something live, you give the customer a specific, realistic timeline and own the follow-up. Your tone is warm, clear, and reassuring.`,

  scheduler: `You are an elite scheduling specialist. Your job is to book appointments accurately, confirm availability, and deliver clear confirmation details every time. You always check the calendar before confirming any slot to prevent double-booking. You confirm the full booking summary — date, time, location or link, and any preparation the customer needs — at the end of every call. You proactively handle rescheduling and cancellations with minimal friction, offering the next two or three available slots when a change is needed. You are precise, organized, and methodical. Your tone is friendly, efficient, and detail-oriented.`,

  collections: `You are a professional and compliant collections agent. You handle payment discussions with firmness, empathy, and strict adherence to regulations. You always verify the customer's identity before discussing any account details. You present balance information clearly and factually, listen to the customer's situation before suggesting solutions, and offer payment plan options where available. You maintain full compliance at all times — no threats, no misleading statements, no harassment. You document every payment promise and commitment made during the call. If a customer invokes their right to cease contact, you honor it immediately and escalate. Your tone is calm, respectful, matter-of-fact, and professional.`,

  technical_support: `You are a senior technical support specialist. You diagnose problems methodically using structured, one-question-at-a-time troubleshooting. You always start with the simplest possible cause (connectivity, restart, settings) before escalating to complex explanations. You speak plainly — avoid unnecessary jargon unless the customer is clearly technical. You confirm the customer's understanding at each diagnostic step, summarize what you found and what you did, and verify the fix works before closing the call. You escalate to Tier 2 only after exhausting all Tier 1 options, and you always give the customer a warm handoff when you do. Your tone is calm, analytical, patient, and thorough.`,

  lead_qualifier: `You are a precision lead qualification agent. Your role is to quickly and accurately determine whether a prospect is the right fit using the BANT framework: Budget, Authority, Need, and Timeline. You ask open-ended discovery questions naturally — it must feel like a conversation, not an interrogation. You score the conversation in your head as you go, and you hand warm leads to the sales team with a crisp two-sentence handoff summary. You keep conversations focused and respectful. You never waste time on clearly dead-end leads, but you always leave every prospect with a positive impression of the company — even if you don't pass them through. Your tone is professional, curious, and direct.`,

  receptionist: `You are a polished and professional receptionist — the first voice every caller hears. Your job is to create an outstanding first impression, route callers to the right person or department efficiently, take complete and accurate messages, and answer common questions about hours, locations, and services with confidence. You handle every inquiry gracefully and never leave a caller feeling unheard or lost. You take complete messages: name, callback number, reason for calling, and urgency level. You are deeply familiar with every department and never guess on routing — if unsure, you take a message rather than send someone to the wrong place. Your tone is warm, professional, polished, and crisp.`,

  marketing: `You are a charismatic and authentic marketing outreach agent. You represent the brand with genuine enthusiasm — never scripted, never pushy. Your goal is to re-engage past customers, nurture warm prospects, and generate real interest in current offers or events. You personalize every conversation — reference the customer's history and tailor your value pitch to what matters to them specifically. You lead with the most relevant value proposition, keep your pitch under thirty seconds, and measure your success by concrete outcomes: demos booked, trials started, or events confirmed. You never pressure. If someone is disinterested, you offer a value-add (a useful insight, a resource) and exit gracefully — leaving them with a positive impression. Your tone is upbeat, genuine, and creative.`,
};

// Role-specific protocol blocks injected into the Vapi system prompt.
// These add compliance rules, conversation frameworks, and tactical guidance
// tailored to each business function — on top of the base personality.
const ROLE_SPECIFIC_PROTOCOLS: Record<string, string> = {
  collections: `## COLLECTIONS COMPLIANCE PROTOCOL (REQUIRED)
- Always identify yourself and your company name at the start of every call.
- Verify the customer's identity before discussing any account details.
- Never threaten arrest, criminal action, violence, or legal action you cannot take.
- Never use abusive, obscene, or harassing language.
- If the customer says this is the wrong number, believe them and end the call.
- If the customer invokes their right to cease contact, confirm it and end the call immediately.
- Never discuss the debt with anyone other than the debtor, their attorney, or a co-signer.
- Offer available payment plan options before escalating.
- Document every payment promise: amount, date, and method.`,

  lead_qualifier: `## LEAD QUALIFICATION FRAMEWORK (BANT)
- Budget: Uncover their budget range naturally ("What range are you working with for this?").
- Authority: Confirm the decision-maker ("Will it be you making the final call, or is there a team involved?").
- Need: Uncover the specific pain point and urgency ("What's driving this for you right now?").
- Timeline: Establish when they expect to decide or act.
- Score internally as you gather information — don't reveal your scoring.
- Hand off warm leads with a crisp summary: name, need, budget range, timeline, and decision-maker status.`,

  technical_support: `## TECHNICAL DIAGNOSTIC PROTOCOL
- Start with the simplest possible cause: is it plugged in, is it connected, has it been restarted?
- Ask only ONE diagnostic question at a time. Wait for the answer before the next question.
- Before proposing a fix, summarize what you found: "So the issue is X because of Y."
- Walk the customer through the fix step by step. Confirm each step completed.
- Verify the fix worked before closing: "Can you try it now and tell me if it's working?"
- Escalate to Tier 2 only after exhausting Tier 1 options. Always give a warm handoff.
- Log every error code, error message, or symptom the customer mentions.`,

  scheduler: `## SCHEDULING PROTOCOL
- Always use the check_calendar_availability tool BEFORE confirming any time slot.
- Confirm the full booking summary at the end of every call: date, time, location or link, and any prep required.
- When rescheduling, offer the next 2-3 available slots rather than asking an open-ended question.
- Never double-book. If a slot is unavailable, say so and immediately offer alternatives.
- If you cannot access the calendar, take the request as pending and promise a follow-up confirmation.`,

  sales: `## SALES DISCOVERY FRAMEWORK
- Open with a value-anchored question, not a pitch: "What's driving this decision for you right now?"
- Mirror the customer's language when describing their problem before proposing a solution.
- Handle objections with: "That's a fair concern. Here's what others in your position found works..."
- Never manufacture urgency. If there's a real deadline or limited availability, state it factually.
- Always close with a concrete next step: book the demo, schedule the follow-up, or confirm the proposal date.
- Never promise features, pricing, or timelines you cannot guarantee.`,

  marketing: `## MARKETING OUTREACH PROTOCOL
- Open with a personalized hook tied to the customer's history or industry — never a generic pitch.
- Deliver the core value proposition in under 30 seconds, then ask for engagement.
- If interest is detected, move immediately to a concrete offer: demo, trial, or event.
- If disinterested, offer one value-add (a useful insight, a free resource) before exiting gracefully.
- Measure every call by a binary outcome: did they agree to a next step, or not?
- Never pressure. Persistence is one follow-up attempt; harassment is two or more without consent.`,

  customer_service: `## SERVICE RESOLUTION PROTOCOL
- Acknowledge the issue before attempting to solve it: "I completely understand, that's frustrating — let me fix this for you."
- Confirm your diagnosis before proposing a fix: "So just to confirm, the issue you're experiencing is X?"
- If the fix requires time or follow-up, give the customer a specific, realistic timeline and own the follow-up.
- Verify the resolution before ending the call: "Is everything working the way you'd expect now?"
- Never promise something you cannot deliver. Under-promise, over-deliver.`,

  receptionist: `## ROUTING PROTOCOL
- Greet: identify yourself and the company within the first sentence.
- Determine the caller's intent within the first exchange — ask a single, open-ended routing question.
- Route to the right department confidently. If unsure, take a complete message rather than guess.
- Complete messages include: caller's name, callback number, reason for calling, and urgency.
- For common questions (hours, address, pricing range, services), answer confidently from the Knowledge Base.
- Never leave a caller in silence for more than a few seconds — narrate what you're doing.`,
};


app.get("/api/agents", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: agents, error } = await db.from('wireline_agents').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) console.error("Failed to fetch agents:", error);
    res.json({ agents: agents || [] });
  } catch (error) {
    res.json({ agents: [] }); 
  }
});

// Returns role metadata (label, description, color, and personality template)
// so the UI can render role selectors and apply templates without client-side hardcoding.
app.get("/api/agents/roles", (_req, res) => {
  res.json({
    roles: [
      { value: "sales",            label: "Sales",              description: "Closes deals and drives revenue",           color: "amber" },
      { value: "customer_service", label: "Customer Service",   description: "Handles inbound issues and support",        color: "emerald" },
      { value: "scheduler",        label: "Scheduler",          description: "Books appointments and manages calendars",  color: "violet" },
      { value: "collections",      label: "Collections",        description: "Handles payment follow-ups and recovery",   color: "rose" },
      { value: "technical_support",label: "Technical Support",  description: "Diagnoses and resolves technical issues",   color: "blue" },
      { value: "lead_qualifier",   label: "Lead Qualifier",     description: "Screens and scores inbound prospects",      color: "orange" },
      { value: "receptionist",     label: "Receptionist",       description: "Routes calls and creates first impressions",color: "cyan" },
      { value: "marketing",        label: "Marketing",          description: "Nurtures prospects and runs campaigns",     color: "purple" },
    ],
    templates: ROLE_PERSONALITY_TEMPLATES
  });
});

// Apply a role template directly to an agent's personality record.
// Called from the Fleet Settings "Apply Role Template" button.
app.post("/api/agents/:id/apply-role", authenticateUser, async (req: any, res: any) => {
  try {
    const { role } = req.body;
    const template = ROLE_PERSONALITY_TEMPLATES[role as keyof typeof ROLE_PERSONALITY_TEMPLATES];
    if (!template) return res.status(400).json({ error: "Unknown role" });

    await db.from('wireline_personality')
      .upsert({ agent_id: req.params.id, user_id: req.user.id, content: template }, { onConflict: 'agent_id' })
      .eq('agent_id', req.params.id);

    res.json({ success: true, content: template });
  } catch (error) {
    res.status(500).json({ error: "Failed to apply role template" });
  }
});

app.post("/api/agents", authenticateUser, async (req: any, res: any) => {
  try {
    // SECURITY ENFORCEMENT: Check Subscription Status for this specific user
    const { data: userSettings } = await db.from('wireline_settings').select('subscription_status, max_agents').eq('user_id', req.user.id).single();
    
    // Gating mechanism: Prevent agent creation if the account is unpaid
    const subscriptionStatus = userSettings?.subscription_status || 'active'; 
    if (subscriptionStatus !== 'active') {
       return res.status(403).json({ error: "Access Denied: Please upgrade your billing plan." });
    }

    // Agent Limit Check
    const maxAgents = userSettings?.max_agents || 3;
    const { count: agentCount } = await db.from('wireline_agents').select('*', { count: 'exact', head: true }).eq('user_id', req.user.id);
    
    if (agentCount !== null && agentCount >= maxAgents) {
      return res.status(403).json({ error: `Quota Exceeded: Your plan only allows ${maxAgents} agents.` });
    }

    const { id, name, voice_id, channel, role } = req.body;
    const agentRole = role || DEFAULT_AGENT_ROLE;
    await db.from('wireline_agents').insert({
      id: id || `agent-${Date.now()}`,
      user_id: req.user.id,
      name: name || "New Agent",
      voice_id: voice_id || 'bIHbv24MWmeRgasZH58o',
      channel: channel || 'voice',
      role: agentRole
    });
    
    // Seed role-appropriate default personality
    await db.from('wireline_personality').insert({
       agent_id: id,
       user_id: req.user.id,
       content: ROLE_PERSONALITY_TEMPLATES[agentRole as keyof typeof ROLE_PERSONALITY_TEMPLATES]
         ?? (channel === 'email'
           ? "You are a professional email agent specialized in clear, efficient communication."
           : "You are a helpful assistant serving as a phone agent.")
    });
    
    res.json({ success: true, id });
  } catch (error) {
    console.error("Agent creation failed:", error);
    res.status(500).json({ error: "Failed to create agent" });
  }
});

app.post("/api/fleet/seed", authenticateUser, async (req: any, res: any) => {
  const userId = req.user.id;
  const specializedAgents = [
    {
      id: `billing-spec-${Date.now()}`,
      name: "Billing Specialist",
      channel: "voice",
      role: "collections",
      archetype: "The Collector",
      first_message: "Hello, this is the billing department. I'm calling regarding your recent account inquiry. How can I assist you with your statement today?",
      personality: ROLE_PERSONALITY_TEMPLATES.collections
    },
    {
      id: `prospector-${Date.now()}`,
      name: "Outbound Prospector",
      channel: "voice",
      role: "sales",
      archetype: "The Closer",
      first_message: "Hi there! I'm calling from the growth team. We saw you were interested in our services and I wanted to see if we could set up a quick strategy session?",
      personality: ROLE_PERSONALITY_TEMPLATES.sales
    },
    {
      id: `growth-email-${Date.now()}`,
      name: "Growth Coordinator",
      channel: "email",
      role: "marketing",
      archetype: "Receptionist",
      email_agent_tone: "Friendly",
      email_signature: "The Growth Team",
      personality: ROLE_PERSONALITY_TEMPLATES.marketing
    },
    {
      id: `tech-support-${Date.now()}`,
      name: "Tier 2 Technical Lead",
      channel: "voice",
      role: "technical_support",
      archetype: "Support Tech",
      first_message: "Wireline Technical Support, this is the Tier 2 lead speaking. I understand you're having a complex issue. Let's get this resolved. What symptoms are you seeing?",
      personality: ROLE_PERSONALITY_TEMPLATES.technical_support
    }
  ] as Array<{
    id: string; name: string; channel: string; role: string; archetype?: string;
    first_message?: string; email_agent_tone?: string; email_signature?: string;
    personality: string;
  }>;

  try {
    for (const agent of specializedAgents) {
      await db.from('wireline_agents').insert({
        id: agent.id,
        user_id: userId,
        name: agent.name,
        channel: agent.channel,
        role: agent.role,
        archetype: agent.archetype,
        first_message: agent.first_message,
        email_agent_tone: agent.email_agent_tone,
        email_signature: agent.email_signature
      });

      await db.from('wireline_personality').insert({
        agent_id: agent.id,
        user_id: userId,
        content: agent.personality
      });
      
      // Add a default directive for each
      await db.from('wireline_directives').insert({
        agent_id: agent.id,
        user_id: userId,
        content: "Always verify the customer's identity before discussing account details.",
        priority: 10
      });
    }
    res.json({ success: true, count: specializedAgents.length });
  } catch (error) {
    console.error("Fleet seeding failed:", error);
    res.status(500).json({ error: "Failed to seed fleet" });
  }
});

// Update agent settings
app.put("/api/agents/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { name, voice_id, voice_id_inbound, voice_id_outbound, voice_provider, first_message, archetype, ambient_noise, website_url, transfer_phone, email_auto_respond, email_agent_tone, email_signature, channel, role } = req.body;
    await db.from('wireline_agents').update({ 
      name, 
      voice_id, 
      voice_id_inbound,
      voice_id_outbound,
      voice_provider, 
      first_message, 
      archetype, 
      ambient_noise, 
      website_url, 
      transfer_phone, 
      email_auto_respond, 
      email_agent_tone, 
      email_signature,
      channel,
      role
    }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update agent" });
  }
});

app.get("/api/agent-config/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const [directives, knowledge, personality, lessons] = await Promise.all([
      db.from('wireline_directives').select('*').eq('agent_id', agentId).eq('user_id', req.user.id).order('priority', { ascending: false }),
      db.from('wireline_knowledge').select('*').eq('agent_id', agentId).eq('user_id', req.user.id),
      db.from('wireline_personality').select('content').eq('agent_id', agentId).eq('user_id', req.user.id).single(),
      db.from('wireline_agent_lessons').select('*').eq('agent_id', agentId).eq('user_id', req.user.id).order('created_at', { ascending: false })
    ]);
    res.json({
      directives: directives.data || [],
      knowledge: knowledge.data || [],
      personality: personality.data?.content || "",
      lessons: lessons.data || []
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

// ==========================================
// 1.5.4 PHONE NUMBER MANAGEMENT
// ==========================================
app.get("/api/phone-numbers", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_phone_numbers').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ numbers: data || [] });
  } catch (error) {
    res.json({ numbers: [] });
  }
});

app.post("/api/phone-numbers", authenticateUser, async (req: any, res: any) => {
  try {
    const { phone_number, vapi_number_id } = req.body;
    await db.from('wireline_phone_numbers').insert({ phone_number, vapi_number_id, user_id: req.user.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to add phone number" });
  }
});

app.patch("/api/phone-numbers/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { agent_id } = req.body;
    await db.from('wireline_phone_numbers').update({ agent_id }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update phone number assignment" });
  }
});

// ==========================================
// 1.5.6 CARRIER SYNC (VAPI PROXY)
// ==========================================
app.get("/api/carrier/numbers", authenticateUser, async (req: any, res: any) => {
  try {
    const vapiSecret = process.env.VAPI_PRIVATE_KEY;
    if (!vapiSecret) return res.json({ numbers: [] });

    const response = await fetchWithTimeout("https://api.vapi.ai/phone-number", {
      headers: { "Authorization": `Bearer ${vapiSecret}` }
    }, 15_000);
    const data = await response.json();
    
    // The Vapi response is usually an array of phone number objects
    const formatted = (data || []).map((num: any) => ({
      id: num.id,
      number: num.number,
      provider: num.provider
    }));

    res.json({ numbers: formatted });
  } catch (error) {
    console.error("Vapi sync error:", error);
    res.json({ numbers: [] });
  }
});

// ==========================================
// FLEET MANAGEMENT ENDPOINTS
// ==========================================
app.get("/api/fleet/presence", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_signal_presence')
      .select('*')
      .eq('user_id', req.user.id);
    
    if (error) throw error;
    res.json({ signals: data || [] });
  } catch (error) {
    console.error("Presence fetch failed:", error);
    res.json({ signals: [] });
  }
});

app.get("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from('wireline_fleet_tasks')
                                     .select('*, wireline_agents(name)')
                                     .eq('user_id', req.user.id);
    
    if (error) throw error;

    const sortedTasks = (data || []).sort((a: any, b: any) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      const priorityWeight: Record<string, number> = { 'high': 3, 'medium': 2, 'low': 1 };
      const weightA = priorityWeight[a.priority?.toLowerCase()] || 0;
      const weightB = priorityWeight[b.priority?.toLowerCase()] || 0;
      if (weightA !== weightB) return weightB - weightA;
      if (a.due_date && b.due_date) return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    res.json({ tasks: sortedTasks });
  } catch (error) {
    console.error("Fetch tasks failed:", error);
    res.json({ tasks: [] });
  }
});

app.post("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
  try {
    const { source_type, source_id, target_channel, customer_info, task_type, description, agent_id, priority, due_date } = req.body;
    await db.from('wireline_fleet_tasks').insert({
       source_type, source_id, target_channel, customer_info, task_type, description, agent_id, status: 'pending', user_id: req.user.id, priority: priority || 'medium', due_date
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to create fleet task" });
  }
});

app.patch("/api/fleet/tasks/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { status, priority, due_date, agent_id, resolution_notes } = req.body;
    const updateData: any = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (due_date !== undefined) updateData.due_date = due_date;
    if (agent_id !== undefined) updateData.agent_id = agent_id;
    if (resolution_notes !== undefined) updateData.resolution_notes = resolution_notes;
    
    await db.from('wireline_fleet_tasks').update(updateData).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update fleet task" });
  }
});

app.post("/api/agent-config/:id/manual", authenticateUser, async (req: any, res: any) => {
  try {
    const agentId = req.params.id;
    const { type, content, overrideId } = req.body; // type is 'personality', 'directive', or 'knowledge'
    const userId = req.user.id;
    
    if (type === 'personality') {
       await db.from('wireline_personality').upsert({ agent_id: agentId, content, user_id: userId });
    } else if (type === 'directive') {
       if (overrideId) {
          await db.from('wireline_directives').update({ content }).eq('id', overrideId).eq('user_id', userId);
       } else {
          await db.from('wireline_directives').insert({ agent_id: agentId, content, priority: 5, user_id: userId });
       }
    } else if (type === 'knowledge') {
       if (overrideId) {
          await db.from('wireline_knowledge').update({ content }).eq('id', overrideId).eq('user_id', userId);
       } else {
          await db.from('wireline_knowledge').insert({ agent_id: agentId, content, user_id: userId });
       }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("Manual config error", error);
    res.status(500).json({ error: "Failed to update" });
  }
});

app.delete("/api/agent-config/:id/:type/:rowId", authenticateUser, async (req: any, res: any) => {
    try {
      const { type, rowId } = req.params;
      const userId = req.user.id;
      if (type === 'directive') await db.from('wireline_directives').delete().eq('id', rowId).eq('user_id', userId);
      if (type === 'knowledge') await db.from('wireline_knowledge').delete().eq('id', rowId).eq('user_id', userId);
      res.json({ success: true });
    } catch(e) {
      res.status(500).json({ error: "Failed to delete" });
    }
 });

// ──────────────────────────────────────────────────────────
//  KNOWLEDGE BASE MANAGER — cross-agent view of every fact in
//  wireline_knowledge. Agents accumulate knowledge from URL/PDF
//  ingest, agent-forge seed, and per-agent manual entry; this is
//  the centralized place to audit, edit, and prune.
// ──────────────────────────────────────────────────────────

app.get("/api/knowledge", authenticateUser, async (req: any, res: any) => {
  try {
    const [{ data: rows, error }, { data: agents }] = await Promise.all([
      db.from("wireline_knowledge")
        .select("id, agent_id, content, created_at")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(2000),
      db.from("wireline_agents")
        .select("id, name, archetype")
        .eq("user_id", req.user.id),
    ]);
    if (error) throw error;
    const agentMap = new Map((agents || []).map((a: any) => [a.id, a]));
    const knowledge = (rows || []).map((r: any) => {
      const agent = agentMap.get(r.agent_id) as any;
      return {
        id: r.id,
        agent_id: r.agent_id,
        agent_name: agent?.name || "(unknown agent)",
        agent_archetype: agent?.archetype || null,
        content: r.content,
        created_at: r.created_at,
      };
    });
    res.json({
      knowledge,
      agents: (agents || []).map((a: any) => ({ id: a.id, name: a.name, archetype: a.archetype })),
      total: knowledge.length,
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load knowledge" }); }
});

app.post("/api/knowledge", authenticateUser, async (req: any, res: any) => {
  try {
    const content = (req.body?.content || "").toString().trim();
    const agent_id = (req.body?.agent_id || "").toString();
    if (!content) return res.status(400).json({ error: "content is required" });
    if (!agent_id) return res.status(400).json({ error: "agent_id is required" });

    // Confirm the agent belongs to this user before insert.
    const { data: agent } = await db.from("wireline_agents")
      .select("id, name, archetype")
      .eq("id", agent_id).eq("user_id", req.user.id).maybeSingle();
    if (!agent) return res.status(404).json({ error: "Agent not found." });

    const { data, error } = await db.from("wireline_knowledge")
      .insert({ user_id: req.user.id, agent_id, content: content.slice(0, 8000) })
      .select("id, agent_id, content, created_at")
      .single();
    if (error) throw error;
    res.json({
      knowledge: {
        ...data,
        agent_name: agent.name,
        agent_archetype: agent.archetype,
      },
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to create" }); }
});

app.patch("/api/knowledge/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const content = (req.body?.content || "").toString().trim();
    if (!content) return res.status(400).json({ error: "content is required" });
    const { data, error } = await db.from("wireline_knowledge")
      .update({ content: content.slice(0, 8000) })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select("id, agent_id, content, created_at")
      .single();
    if (error) throw error;
    res.json({ knowledge: data });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to update" }); }
});

app.delete("/api/knowledge/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { error } = await db.from("wireline_knowledge")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to delete" }); }
});

// ==========================================
// 1.8 SETTINGS & OUTBOUND DIALER ENDPOINTS
// ==========================================
app.get("/api/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const { data } = await db.from('wireline_settings').select('*').eq('user_id', req.user.id).single();
    if (data) {
       delete data.vapi_private_key; // Never send secret to client
    }
    res.json(data || {});
  } catch (error) {
    res.json({});
  }
});

app.post("/api/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const { vapi_phone_number_id, subscription_status, max_agents, voice_llm_provider, voice_llm_model } = req.body;

    // Build patch with only the fields the caller actually sent so we
    // don't accidentally clobber unrelated settings.
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (vapi_phone_number_id !== undefined) patch.vapi_phone_number_id = vapi_phone_number_id;
    if (subscription_status !== undefined) patch.subscription_status = subscription_status;
    if (max_agents !== undefined) patch.max_agents = max_agents;
    if (voice_llm_provider !== undefined) patch.voice_llm_provider = voice_llm_provider;
    if (voice_llm_model !== undefined) patch.voice_llm_model = voice_llm_model;

    const { data: existing } = await db.from('wireline_settings').select('id').eq('user_id', req.user.id).single();

    if (existing) {
       await db.from('wireline_settings').update(patch).eq('user_id', req.user.id);
    } else {
       await db.from('wireline_settings').insert({ ...patch, user_id: req.user.id });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

app.get("/api/outbound", authenticateUser, async (req: any, res: any) => {
  try {
    const { data } = await db.from('wireline_outbound_leads').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    res.json({ leads: data || [] });
  } catch (error) {
    res.json({ leads: [] });
  }
});

// ──────────────────────────────────────────────────────────────────
// placeOutboundCall — assemble agent context, build the Vapi payload,
// and dispatch the call. Returns { ok: true, callId } on success or a
// shaped error so callers can map to HTTP status. Used by both
// /api/outbound/dial (manual) and /api/intake/lead (auto-dial).
//
// The lead row is intentionally NOT written here — manual dial inserts
// a fresh row; intake auto-dial updates an existing row. Keeping the
// persistence decision in the caller avoids accidental duplicates.
// ──────────────────────────────────────────────────────────────────
// Flat shape (rather than a discriminated union) so the call sites
// can read `.status` / `.error` without strict-mode narrowing — this
// project's tsconfig doesn't have strictNullChecks enabled.
type PlaceCallResult = {
  ok: boolean;
  callId?: string;
  status?: number;
  error?: string;
};

async function placeOutboundCall(opts: {
  userId: string;
  agentId: string;
  customerName?: string | null;
  customerNumber: string;
  context?: string | null;
}): Promise<PlaceCallResult> {
  const { userId, agentId, customerName, customerNumber, context } = opts;

  // 0. Subscription guard
  const { data: userSettings } = await db.from('wireline_settings').select('*').eq('user_id', userId).single();
  const subscriptionStatus = userSettings?.subscription_status || 'active';
  if (subscriptionStatus !== 'active') {
    return { ok: false, status: 403, error: "Access Denied: Please upgrade your billing plan to access outbound dialing." };
  }

  // 1. Vapi config
  const settings = userSettings;
  const vapiSecret = process.env.VAPI_PRIVATE_KEY;
  if (!vapiSecret || !settings?.vapi_phone_number_id) {
    return { ok: false, status: 400, error: "Platform Error: Master telecom carrier not configured. Please ensure VAPI_PRIVATE_KEY is set in environment secrets." };
  }

  // 2. Agent context
  const [agentConfig, directivesData, knowledgeData, personalityData, lessonsData] = await Promise.all([
    db.from('wireline_agents').select('*').eq('id', agentId).single().then(r => r),
    db.from('wireline_directives').select('content, priority').eq('agent_id', agentId).order('priority', { ascending: false }).then(r => r),
    db.from('wireline_knowledge').select('content').eq('agent_id', agentId).then(r => r),
    db.from('wireline_personality').select('content').eq('agent_id', agentId).single().then(r => r),
    db.from('wireline_agent_lessons').select('lesson').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(3).then(r => r),
  ]);

  if (!agentConfig?.data) {
    return { ok: false, status: 404, error: `Agent ${agentId} not found.` };
  }

  const lessons = (lessonsData?.data || []).map((l: any) => l.lesson).join('\n');
  const currentDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  // Derive the archetype from the agent's role for outbound calls
  const outboundAgentRole = agentConfig?.data?.role || DEFAULT_AGENT_ROLE;
  const OUTBOUND_ARCHETYPE_BY_ROLE: Record<string, string> = {
    sales:             'The Closer',
    lead_qualifier:    'The Closer',
    marketing:         'The Closer',
    customer_service:  'The Empath',
    technical_support: 'Support Tech',
    collections:       'The Collector',
    scheduler:         'Receptionist',
    receptionist:      'Receptionist',
  };
  const archetype = OUTBOUND_ARCHETYPE_BY_ROLE[outboundAgentRole] || agentConfig?.data?.archetype || 'The Closer';
  let archetypeRules = "";
  let llmTemp = 0.4;
  switch (archetype) {
    case 'The Closer':
      archetypeRules = "You are a consultative closer. Lead with discovery — uncover the prospect's pain before pitching. If a lead hesitates, ask an open-ended question to surface the real objection, then address it with evidence. Offer a concrete next step (demo, proposal, decision call) in every conversation.";
      llmTemp = 0.7;
      break;
    case 'Support Tech':
      archetypeRules = "You are highly analytical, patient, and precise. You ask clarifying troubleshooting questions one at a time. You do not rush. You summarize your findings before proposing a fix, and you verify the fix worked before closing.";
      llmTemp = 0.2;
      break;
    case 'The Empath':
      archetypeRules = "If a caller sounds frustrated, your first words must be a validating statement like 'I completely hear you, that's incredibly stressful. Let me fix this for you.' You acknowledge before you fix, always.";
      llmTemp = 0.6;
      break;
    case 'The Collector':
      archetypeRules = "You are firm, professional, and fully compliant with debt collection regulations. You always verify identity before discussing account details. You present the balance factually, listen to the customer's situation, and offer payment plan options before escalating. You never threaten, never harass, and document every promise made.";
      llmTemp = 0.3;
      break;
    default:
      archetypeRules = "You are an expert at handling phone calls where people are often in a hurry. Never use platitudes like 'I hope you're having a wonderful day.' Get straight to the value. You are cheerful, polite, and highly efficient.";
      llmTemp = 0.4;
  }
  const ambientNoiseActive = agentConfig?.data?.ambient_noise && agentConfig?.data?.ambient_noise !== 'off';
  const roleProtocol = ROLE_SPECIFIC_PROTOCOLS[outboundAgentRole] || "";
  // Respect user's voice LLM settings (same as inbound). Fallback to Gemini Flash.
  const voiceLlmProvider = settings?.voice_llm_provider || 'google';
  const voiceLlmModel = settings?.voice_llm_model || 'gemini-1.5-flash';

  const systemPrompt = `
    ## BLOCK 1: IDENTITY & ARCHETYPE (THE "MOAT")
    Persona: You are ${agentConfig?.data?.name || "a scheduling agent"}, a representative for our company.
    Role: ${outboundAgentRole.replace(/_/g, ' ').toUpperCase()}
    Tone: Snappy, concise, low-friction.
    The "Secret Sauce": ${archetypeRules}
    Base Personality: ${personalityData?.data?.content || "You are a professional, helpful assistant."}
    ${ambientNoiseActive ? "Ambient Realism: You are working in a busy location. Speak with a slight sense of professional urgency." : ""}

    ## CRITICAL OUTBOUND MISSION CONTEXT
    You are making an OUTBOUND call to a customer named ${customerName || "a customer"}.
    Outbound Call Context / Objective: ${context || "Just checking in on them."}
    You must address this objective naturally during the conversation.

    ${lessons ? `## RECENT LESSONS LEARNED (IMPROVEMENTS)\nApply these tactical adjustments from your previous calls:\n${lessons}` : ""}

    ${roleProtocol}

    ## BLOCK 2: TEMPORAL & CONTEXTUAL ANCHORS
    You unmistakably know that today is ${currentDateTime} (Eastern Time). If a customer asks for "tomorrow" or "next week", calculate the date silently and confirm it back to them.

    ## BLOCK 3: CONVERSATIONAL LOOP & GUARDRAILS
    Response Length: Keep every response under 20 words unless explaining a complex process. Long AI monologues feel like robots.
    The "Anti-Echo" Rule: Do not repeat back what the user just said.
    Question Limit: Never ask more than one question at a time.
    Number Formatting: Spell out important numbers if they sound robotic (e.g., "Two zero two" instead of "Two hundred and two").

    ## BLOCK 4: TOOL EXECUTION LOGIC & PROTOCOLS
    Escalation Transfer Rule: If a user asks for a "real person" twice, or asks to transfer, immediately inform them you are transferring them and use the tools.

    ## ABSOLUTE RULES
    ${(directivesData?.data || []).map((d: any) => `[PRIORITY ${d.priority}] ${d.content}`).join('\n')}

    ## KNOWLEDGE BASE
    ${(knowledgeData?.data || []).map((k: any) => `- ${k.content}`).join('\n')}
    `;

  const vapiPayload = {
    phoneNumberId: settings.vapi_phone_number_id,
    customer: { number: customerNumber },
    assistant: {
      name: agentConfig?.data?.name || "Wireline Outbound Agent",
      firstMessage: agentConfig?.data?.first_message || `Hi ${customerName ? customerName : 'there'}, this is ${agentConfig?.data?.name || 'your representative'} calling.`,
      backgroundSound: agentConfig?.data?.ambient_noise || 'off',
      model: {
        provider: voiceLlmProvider,
        model: voiceLlmModel,
        systemPrompt: systemPrompt,
        temperature: llmTemp,
      },
      recordingEnabled: true,
      voice: {
        provider: agentConfig?.data?.voice_provider || "11labs",
        voiceId: agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o",
      },
    },
  };

  const vapiResponse = await fetchWithTimeout("https://api.vapi.ai/call/phone", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${vapiSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(vapiPayload),
  }, 20_000);

  if (!vapiResponse.ok) {
    const errBody = await vapiResponse.text();
    return { ok: false, status: 502, error: `Vapi API Error: ${errBody}` };
  }
  const vapiData = await vapiResponse.json();
  return { ok: true, callId: vapiData.id };
}

app.post("/api/outbound/dial", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, customerName, customerNumber, context } = req.body;
    if (!agentId || !customerNumber) {
      return res.status(400).json({ error: "agentId and customerNumber are required." });
    }

    const result = await placeOutboundCall({
      userId: req.user.id,
      agentId,
      customerName,
      customerNumber,
      context,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    await db.from('wireline_outbound_leads').insert({
      user_id: req.user.id,
      agent_id: agentId,
      customer_name: customerName,
      customer_number: customerNumber,
      context: context,
      call_id: result.callId,
      status: "Dialing",
    });

    res.json({ success: true, callId: result.callId });
  } catch (error: any) {
    console.error("Outbound call failed:", error);
    res.status(500).json({ error: error.message || "Failed to dispatch call." });
  }
});

app.post("/api/outbound/bulk", authenticateUser, async (req: any, res: any) => {
  try {
     const { leads } = req.body;
     if (!leads || !leads.length) return res.status(400).json({ error: "No leads provided" });

     // SECURITY ENFORCEMENT
     const { data: userSettings } = await db.from('wireline_settings').select('subscription_status').eq('user_id', req.user.id).single();
     if (userSettings?.subscription_status !== 'active') {
        return res.status(403).json({ error: "Access Denied: Inactive billing plan." });
     }

     const leadsWithUser = leads.map((lead: any) => ({
        ...lead,
        user_id: req.user.id
     }));

     const { data, error } = await db.from('wireline_outbound_leads').insert(leadsWithUser).select('id');
     if (error) throw error;
     
     res.json({ success: true, inserted: data.length });
  } catch (error: any) {
     res.status(500).json({ error: "Failed to queue leads" });
  }
});

// ==========================================
// 2. AGENT TRAINING — SERVER-SIDE EXTRACTION + SAVE
// ==========================================

// /api/train/extract — Claude-first (Gemini fallback) extraction of
// directives, knowledge, and personality from a free-text operator message.
// Saves the extracted data immediately, then returns a formatted confirmation
// so the client can update the chat UI without a second round-trip.
app.post("/api/train/extract", authenticateUser, async (req: any, res: any) => {
  const { message, agentId = "default-agent" } = req.body;
  const userId = req.user.id;
  if (!message?.trim()) return res.status(400).json({ error: "message is required" });

  let parsed: { directives: any[]; knowledge: any[]; personality: string } = {
    directives: [], knowledge: [], personality: ""
  };

  // ── Claude path ───────────────────────────────────────────────────
  if (claudeBrain.isClaudeAvailable()) {
    try {
      const extractionTool = {
        name: "extract_training_data",
        description: "Extract operational directives, knowledge facts, and personality updates from operator input.",
        input_schema: {
          type: "object",
          properties: {
            directives: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string", description: "A hard rule the agent must follow." },
                  priority: { type: "integer", minimum: 1, maximum: 10, description: "1=low, 10=critical." }
                },
                required: ["content", "priority"],
                additionalProperties: false
              },
              description: "Rules the agent must always obey. Only include if the input contains explicit behavioral rules."
            },
            knowledge: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  content: { type: "string", description: "A factual statement about the business." }
                },
                required: ["content"],
                additionalProperties: false
              },
              description: "Facts about the business (hours, pricing, services, policies). Only include if the input contains concrete facts."
            },
            personality: {
              type: "string",
              description: "Updated personality / tone instruction. Only include if the operator is explicitly requesting a tone or style change; otherwise use an empty string."
            }
          },
          required: ["directives", "knowledge", "personality"],
          additionalProperties: false
        }
      } as any;

      parsed = await claudeBrain.runStructured({
        system: `You are the Wireline Configuration Engine. A business operator is training an AI agent (ID: ${agentId}). Extract structured configuration from their message. Be conservative — only extract information that is clearly intended as a directive, a knowledge fact, or a personality change. If the input is conversational or ambiguous, return empty arrays and an empty personality string.`,
        user: message,
        tool: extractionTool,
        maxTokens: 1024,
      });
    } catch (err) {
      console.error("Claude extraction failed; falling back to Gemini:", err);
    }
  }

  // ── Gemini fallback ───────────────────────────────────────────────
  const noDataExtracted = !parsed.directives.length && !parsed.knowledge.length && !parsed.personality;
  if (noDataExtracted) {
    try {
      const prompt = `
You are the Wireline Configuration Engine. A business owner is training their AI fleet.
Current Training Target: ${agentId}
User Message: "${message}"

Extract any new instructions, rules, or knowledge from the message.
Categorize them as:
- DIRECTIVE: A hard rule the agent must follow (e.g. "Never give out personal cell numbers").
- KNOWLEDGE: A fact about the business (e.g. "We are closed on Sundays").
- PERSONALITY: A request regarding tone or style (e.g. "Be more enthusiastic and upbeat").

Respond ONLY in strict, valid JSON format (no markdown):
{"directives":[{"content":"...","priority":5}],"knowledge":[{"content":"..."}],"personality":""}`;

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });
      const geminiRes = await model.generateContent(prompt);
      const geminiParsed = JSON.parse(geminiRes.response.text() || "{}");
      parsed = {
        directives: geminiParsed.directives || [],
        knowledge: geminiParsed.knowledge || [],
        personality: geminiParsed.personality || "",
      };
    } catch (err) {
      console.error("Gemini extraction fallback failed:", err);
    }
  }

  // ── Persist ───────────────────────────────────────────────────────
  try {
    if (parsed.directives.length) {
      await db.from('wireline_directives').insert(
        parsed.directives.map((d: any) => ({ content: d.content, priority: d.priority ?? 5, agent_id: agentId, user_id: userId }))
      );
    }
    if (parsed.knowledge.length) {
      await db.from('wireline_knowledge').insert(
        parsed.knowledge.map((k: any) => ({ content: k.content, agent_id: agentId, user_id: userId }))
      );
    }
    if (parsed.personality) {
      await db.from('wireline_personality').upsert({
        agent_id: agentId,
        user_id: userId,
        content: parsed.personality,
      });
    }
  } catch (err) {
    console.error("Training persistence failed:", err);
    return res.status(500).json({ error: "Failed to save training data" });
  }

  // ── Format confirmation message ───────────────────────────────────
  let responseContent = "MODIFICATIONS SYNCED TO MISSION CONTROL.\n\n";
  if (parsed.directives.length) {
    responseContent += `ADDED ${parsed.directives.length} OPERATIONAL DIRECTIVE(S):\n`;
    responseContent += parsed.directives.map((d: any) => `> [PRIORITY ${d.priority ?? 5}] ${d.content}`).join("\n") + "\n\n";
  }
  if (parsed.knowledge.length) {
    responseContent += `SYNCED ${parsed.knowledge.length} INTELLIGENCE FACT(S):\n`;
    responseContent += parsed.knowledge.map((k: any) => `> ${k.content}`).join("\n") + "\n\n";
  }
  if (parsed.personality) {
    responseContent += `UPDATED NEURAL PERSONALITY:\n> ${parsed.personality}`;
  }
  if (!parsed.directives.length && !parsed.knowledge.length && !parsed.personality) {
    responseContent = "INPUT ANALYZED. NO NEW DIRECTIVES DETECTED. PLEASE SPECIFY CONCRETE OPERATIONAL RULES OR KNOWLEDGE ENTRY.";
  }

  res.json({ success: true, responseContent, directives: parsed.directives, knowledge: parsed.knowledge, personality: parsed.personality });
});

// ==========================================
// 2a. AGENT TRAINING ENDPOINT (SAVE EXTRACTED DATA)
// ==========================================
app.post("/api/train/save", authenticateUser, async (req: any, res: any) => {
  const { extracted, agentId = "default-agent" } = req.body;
  const userId = req.user.id;
  
  try {
    const parsed = extracted || {};

    // Atomic update to Supabase with user_id enforcement
    if (parsed.directives && parsed.directives.length) {
      await db.from('wireline_directives').insert(
        parsed.directives.map((d: any) => ({ ...d, agent_id: agentId, user_id: userId }))
      );
    }
    if (parsed.knowledge && parsed.knowledge.length) {
      await db.from('wireline_knowledge').insert(
        parsed.knowledge.map((k: any) => ({ ...k, agent_id: agentId, user_id: userId }))
      );
    }
    if (parsed.personality) {
      // Upsert personality with user_id enforcement
      await db.from('wireline_personality').upsert({ 
        agent_id: agentId, 
        user_id: userId,
        content: parsed.personality,
        updated_at: new Date().toISOString()
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Training save error:", error);
    res.status(500).json({ error: "Failed to save intelligence patterns" });
  }
});


// ==========================================
// Google Workspace OAuth Endpoints
// ==========================================

app.get('/api/oauth/google/url', oauthRateLimiter, (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
     return res.status(500).json({ error: "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables." });
  }

  const oauth2Client = getGoogleOAuthClient(req);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Forces consent screen to always get a refresh token
  });
  
  res.json({ url: authUrl });
});

app.get(['/api/oauth/google/callback', '/api/oauth/google/callback/'], oauthRateLimiter, async (req, res) => {
  const { code } = req.query;
  
  if (!code || typeof code !== 'string') {
    return res.status(400).send("No code provided by Google.");
  }

  try {
    const oauth2Client = getGoogleOAuthClient(req);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Fetch user info to get email address
    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const userInfo = await oauth2.userinfo.get();
    const emailAddress = userInfo.data.email;

    if (!emailAddress) throw new Error("Could not fetch user email.");

    // Store in Supabase
    await db.from('wireline_email_accounts').insert({
      email_address: emailAddress,
      provider: 'google',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date
    });

    // Send success to popup. Restrict postMessage to the configured app
    // origin (or the current request origin when APP_URL isn't set) so
    // a malicious page that opens this popup can't intercept the email.
    const targetOrigin = (process.env.APP_URL && new URL(process.env.APP_URL).origin)
      || `${req.protocol}://${req.get('host')}`;
    // JSON-encode values to neutralize any HTML/JS injection via the email field.
    const safeEmail = JSON.stringify(emailAddress);
    const safeOrigin = JSON.stringify(targetOrigin);
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', email: ${safeEmail} }, ${safeOrigin});
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    log.error("OAuth callback failed", {
      requestId: res.locals?.requestId,
      error: (error as any)?.message || String(error),
    });
    // Generic message to the user — never leak the raw error / stack /
    // DB strings the SDK may attach.
    res.status(500).send("Authentication failed. Please try again or contact support.");
  }
});

// Get connected accounts
app.get("/api/emails/accounts", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: accounts, error } = await db.from('wireline_email_accounts')
                                               .select('*')
                                               .eq('user_id', req.user.id)
                                               .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ accounts: accounts || [] });
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

app.patch("/api/emails/accounts/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const { agent_id } = req.body;
    await db.from('wireline_email_accounts').update({ agent_id }).eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update account mapping" });
  }
});

app.delete("/api/emails/accounts/:id", authenticateUser, async (req: any, res: any) => {
  try {
    await db.from('wireline_email_accounts').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: "Failed to disconnect account" });
  }
});


// ==========================================
// 2.3 EMAIL THREAD & SYNC ENDPOINTS
// ==========================================

app.get("/api/emails/threads", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: threads, error } = await db.from('wireline_email_threads')
                                           .select('*')
                                           .eq('user_id', req.user.id)
                                           .order('last_message_at', { ascending: false });
    if (error) throw error;
    res.json({ threads: threads || [] });
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

app.get("/api/emails/threads/:id/messages", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: messages, error } = await db.from('wireline_email_messages')
                                             .select('*')
                                             .eq('thread_id', req.params.id)
                                             .eq('user_id', req.user.id)
                                             .order('created_at', { ascending: true });
    if (error) throw error;
    res.json({ messages: messages || [] });
  } catch(e) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// The "AI Intelligence" Sync
app.post("/api/emails/sync", authenticateUser, async (req: any, res: any) => {
  try {
     const userId = req.user.id;
     // 1. Fetch connected accounts
     const { data: accounts } = await db.from('wireline_email_accounts').select('*').eq('user_id', userId);
     if (!accounts || accounts.length === 0) return res.json({ success: true, count: 0 });

     // Fleet Synchronization
     const { data: agent } = await db.from('wireline_agents').select('*').eq('user_id', userId).limit(1).single();

     let totalNew = 0;

     for (const account of accounts) {
        // Fetch agent for this specific account
        let activeAgent = agent;
        let knowledge = [];
        let directives = [];
        if (account.agent_id) {
          const { data: specificAgent } = await db.from('wireline_agents').select('*').eq('id', account.agent_id).single();
          if (specificAgent) activeAgent = specificAgent;
          
          const knowledgeRes = await db.from('wireline_knowledge').select('content').eq('agent_id', account.agent_id);
          if (knowledgeRes.data) knowledge = knowledgeRes.data.map(k => k.content);

          const directivesRes = await db.from('wireline_directives').select('content').eq('agent_id', account.agent_id);
          if (directivesRes.data) directives = directivesRes.data.map(d => d.content);
        }

        const oauth2Client = getGoogleOAuthClient(req);
        oauth2Client.setCredentials({
           access_token: account.access_token,
           refresh_token: account.refresh_token,
           expiry_date: account.expires_at
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        
        // Fetch unread messages
        const gmailRes = await gmail.users.messages.list({
           userId: 'me',
           q: 'is:unread',
           maxResults: 5
        });

        const messages = gmailRes.data.messages || [];
        
        for (const msg of messages) {
           const msgData = await gmail.users.messages.get({ userId: 'me', id: msg.id! });
           const headers = msgData.data.payload?.headers || [];
           const subject = headers.find(h => h.name === 'Subject')?.value || "No Subject";
           const from = headers.find(h => h.name === 'From')?.value || "";
           const threadId = msgData.data.threadId!;
           
           // Extract snippet or body
           const snippet = msgData.data.snippet || "";
           
           // Check if thread exists in DB
           let { data: existingThread } = await db.from('wireline_email_threads').select('*').eq('thread_id', threadId).single();
           
           if (!existingThread) {
              const { data: newThread } = await db.from('wireline_email_threads').insert({
                 account_id: account.id,
                 thread_id: threadId,
                 customer_email: from,
                 subject: subject,
                 status: 'pending_ai'
              }).select('*').single();
              existingThread = newThread;
           }

           // Check if message exists in DB
           const { data: existingMsg } = await db.from('wireline_email_messages').select('*').eq('google_message_id', msg.id!).single();
           if (existingMsg) continue;

           totalNew++;

           // Save the customer message
           await db.from('wireline_email_messages').insert({
              thread_id: existingThread!.id,
              google_message_id: msg.id!,
              role: 'customer',
              content: snippet
           });

           // mark as read in Gmail (optional, but good for sync)
           await gmail.users.messages.modify({
              userId: 'me',
              id: msg.id!,
              requestBody: { removeLabelIds: ['UNREAD'] }
           });

           // 3. GENERATE AI RESPONSE — Claude-primary with tool use; Gemini as fallback.
           //    Tool implementations are shared between both paths.
           const checkCalendar = async (date: string) => {
             const { data } = await db.from('wireline_appointments').select('time').ilike('date', `%${date}%`);
             if (data && data.length > 0) {
               return `Booked times on ${date}: ${data.map(a => a.time).join(', ')}. Offer other times.`;
             }
             return `The entire day on ${date} is fully open.`;
           };
           const bookAppointment = async (args: { date: string; time: string; customer_name: string; service_type: string }) => {
             try {
               const { data, error } = await db.from('wireline_appointments').insert({
                 agent_id: activeAgent?.id,
                 date: args.date,
                 time: args.time,
                 customer_name: args.customer_name,
                 service_type: args.service_type,
                 status: "Scheduled",
               }).select('id').single();
               if (error) throw error;
               return { success: true, reference_id: String(data.id).split('-')[0] };
             } catch (e: any) {
               return { success: false, error: e?.message || "Booking failed." };
             }
           };

           let finalReply = "I've received your email and will follow up shortly.";

           if (claudeBrain.isClaudeAvailable()) {
             try {
               const result = await claudeBrain.smartEmailReply({
                 agentName: activeAgent?.name || "Wireline Agent",
                 agentTone: activeAgent?.email_agent_tone || "Professional",
                 agentArchetype: activeAgent?.archetype || "Receptionist",
                 agentRole: activeAgent?.role || DEFAULT_AGENT_ROLE,
                 knowledgeBase: knowledge,
                 directives: directives,
                 fromEmail: from,
                 subject: subject,
                 emailBody: snippet,
                 onCheckCalendar: checkCalendar,
                 onBookAppointment: bookAppointment,
               });
               finalReply = result.replyText || finalReply;
             } catch (err) {
               console.error("Claude email reply failed; falling back to Gemini:", err);
             }
           }

           // Legacy Gemini path — runs when Claude is offline or failed.
           if (finalReply === "I've received your email and will follow up shortly.") {
             const systemInstruction = `
               ## IDENTITY & ARCHETYPE
               Persona: You are the AI Email Agent for our company.
               Tone: ${activeAgent?.email_agent_tone || 'Professional'}. Concise and helpful.
               Personality: ${activeAgent?.archetype || 'Receptionist'}.
               Company Site: ${activeAgent?.website_url || 'Home Services Platform'}.

               ## CONTEXT
               INCOMING EMAIL FROM: ${from}
               SUBJECT: ${subject}

               ## GUARDRAILS
               Response Length: CRITICAL. Keep every email under 20 words where possible. Be direct and avoid flowery pleasantries.
               - If they want an appointment, use your tools to check availability and book it if confirmed.

               ## KNOWLEDGE BASE
               ${knowledge.length > 0 ? knowledge.map(k => `- ${k}`).join('\n') : "Use standard professional knowledge."}

               ## ABSOLUTE RULES
               ${directives.length > 0 ? directives.map(d => `- ${d}`).join('\n') : ""}
             `;

             const tools: any = [{
                functionDeclarations: [
                    { name: "check_calendar_availability", description: "Checks availability on a specific date.", parameters: { type: SchemaType.OBJECT, properties: { date: { type: SchemaType.STRING } }, required: ["date"] } },
                    { name: "book_appointment", description: "Books an appointment.", parameters: { type: SchemaType.OBJECT, properties: { date: { type: SchemaType.STRING }, time: { type: SchemaType.STRING }, customer_name: { type: SchemaType.STRING }, service_type: { type: SchemaType.STRING } }, required: ["date", "time", "customer_name", "service_type"] } },
                ],
             }];

             const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro", systemInstruction, tools, generationConfig: { temperature: 0.4 } });
             const chat = model.startChat();

             try {
                let resObj = await chat.sendMessage(snippet);
                let response = resObj.response;
                let calls = response.functionCalls();
                while (calls && calls.length > 0) {
                   const toolResponses = [];
                   for (const call of calls) {
                       let toolResult = "Tool failed";
                       const args = call.args as any;
                       try {
                           if (call.name === "check_calendar_availability") {
                              toolResult = await checkCalendar(args.date as string);
                           } else if (call.name === "book_appointment") {
                              const r = await bookAppointment(args);
                              toolResult = r.success ? `Booked successfully! Reference ID: ${r.reference_id}` : (r.error || "Booking failed.");
                           }
                       } catch(e) {
                           toolResult = "Error executing tool. Assume failure or ask human.";
                       }
                       toolResponses.push({ functionResponse: { name: call.name, response: { result: toolResult } } });
                   }
                   const nextRes = await chat.sendMessage(toolResponses);
                   response = nextRes.response;
                   calls = response.functionCalls();
                }
                finalReply = response.text() || finalReply;
             } catch(e) {
                console.error("Gemini email fallback also failed:", e);
             }
           }

           if (activeAgent?.email_signature) {
               finalReply = `${finalReply}\n\n${activeAgent.email_signature}`;
           }

           // Save the AI message (as a draft in our DB)
           await db.from('wireline_email_messages').insert({
              thread_id: existingThread!.id,
              role: 'ai',
              content: finalReply
           });

           // 4. AUTONOMOUS AUTO-RESPOND (If enabled)
           if (activeAgent?.email_auto_respond) {
               try {
                  const toEmail = from.includes('<') ? from.split('<')[1].split('>')[0] : from;
                  const raw = Buffer.from(
                     `To: ${toEmail}\r\n` +
                     `Subject: Re: ${subject}\r\n` +
                     `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
                     `${finalReply}`
                  ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

                  await gmail.users.messages.send({
                     userId: 'me',
                     requestBody: { raw, threadId }
                  });
               } catch (sendErr) {
                  console.error("Auto-respond failed:", sendErr);
               }
           }

           // 5. OMNICHANNEL TASK ROUTING (EMAIL -> PHONE)
           const lowerSnippet = snippet.toLowerCase();
           if (lowerSnippet.includes('call') || lowerSnippet.includes('phone') || lowerSnippet.includes('callback') || lowerSnippet.includes('number')) {
              try {
                 await db.from('wireline_fleet_tasks').insert({
                    source_type: 'email_thread',
                    source_id: threadId,
                    target_channel: 'phone',
                    agent_id: activeAgent?.id || null,
                    customer_info: { email: from, subject: subject },
                    task_type: 'callback_required',
                    description: `Lead requested callback via email mailroom. Lead Contact: ${from}`,
                    status: 'pending'
                 });
              } catch(handoffErr) {
                 console.error("Email-to-Phone handoff failed:", handoffErr);
              }
           }

           // Update thread summary & status
           await db.from('wireline_email_threads').update({
              summary: snippet.substring(0, 100),
              last_message_at: new Date(),
              status: 'open'
           }).eq('id', existingThread!.id);

           // AI LEAD SCORING FOR EMAIL — Claude-primary, Gemini fallback.
           try {
              let score = 0; let label = 'none';
              if (claudeBrain.isClaudeAvailable()) {
                 try {
                    const r = await claudeBrain.scoreIntent({ subject, body: snippet });
                    score = r.score || 0; label = r.label || 'none';
                 } catch (err) {
                    console.error("Claude email scoring failed; falling back to Gemini:", err);
                 }
              }
              if (label === 'none' && score === 0) {
                 const emailScoringPrompt = `
                   Analyze this email and give a BUSINESS INTENT score (0-100) and CATEGORY ('high', 'medium', 'low', 'none').
                   Subject: ${subject}
                   Body: ${snippet}
                   RESPONSE FORMAT (JSON): { "score": number, "label": string }
                 `;
                 const sModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" } });
                 const sRes = await sModel.generateContent(emailScoringPrompt);
                 const sObj = JSON.parse(sRes.response.text() || "{}");
                 score = sObj.score || 0; label = sObj.label || 'none';
              }
              await db.from('wireline_email_threads').update({
                 lead_score: score, intent_label: label,
              }).eq('id', existingThread!.id);
           } catch(e) {
              console.error("Email scoring failed:", e);
           }
        }
     }

     res.json({ success: true, synced: totalNew });
  } catch(e) {
     console.error("Sync Error:", e);
     res.status(500).json({ error: String(e) });
  }
});

app.post("/api/emails/threads/:id/reply", authenticateUser, async (req: any, res: any) => {
   try {
      const { body } = req.body;
      const { data: thread } = await db.from('wireline_email_threads').select('*, wireline_email_accounts(*)').eq('id', req.params.id).eq('user_id', req.user.id).single();
      
      if (!thread) throw new Error("Thread not found");

      const account = thread.wireline_email_accounts;
      const oauth2Client = getGoogleOAuthClient(req);
      oauth2Client.setCredentials({
         access_token: account.access_token,
         refresh_token: account.refresh_token,
         expiry_date: account.expires_at
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      // Send via Gmail
      const messageParts = [
        `To: ${thread.customer_email}`,
        `Subject: Re: ${thread.subject}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        body
      ];
      const encodedMessage = Buffer.from(messageParts.join('\n')).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage,
          threadId: thread.thread_id
        }
      });

      // Save to DB
      await db.from('wireline_email_messages').insert({
         thread_id: thread.id,
         role: 'ai',
         content: body
      });

      res.json({ success: true });
   } catch(e) {
      console.error("Reply Error:", e);
      res.status(500).json({ error: String(e) });
   }
});

app.post("/api/emails/draft", authenticateUser, async (req: any, res: any) => {
  try {
     const { subject, messages, context } = req.body;
     const prompt = `You are a professional AI assistant drafting an email reply.
Subject: ${subject}
Conversation history:
${(messages || []).map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}

Extra instructions from user (if any):
${context || 'Write a helpful and polite reply that advances the conversation seamlessly without repeating the context.'}

Draft only the plain text email body. Do not include a subject line. Be professional but brief. Do not include placeholders like "[Your Name]", write as the AI representative if a name is not known, or just leave it off.`;

     const aiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
     const aiRes = await aiModel.generateContent(prompt);

     res.json({ draft: aiRes.response.text() });
  } catch (e) {
     console.error("Draft error:", e);
     res.status(500).json({ error: "Failed to draft reply" });
  }
});

// OPTIMIZE AGENT PROTOCOLS
app.post("/api/agents/:id/optimize", authenticateUser, async (req: any, res: any) => {
   try {
      const { id } = req.params;
      const { data: logs } = await db.from('wireline_call_logs')
         .select('summary, transcript, lead_score, intent_label')
         .eq('agent_id', id).eq('user_id', req.user.id)
         .order('created_at', { ascending: false }).limit(10);

      if (!logs || logs.length === 0) {
         return res.json({ suggestions: [], reason: "Insufficient data: Need at least 1 completed mission log." });
      }

      // Claude path — uses the same agent-review tool as /api/claude/agent-review,
      // but flattens the response to {suggestions, analysis} for legacy callers.
      if (claudeBrain.isClaudeAvailable()) {
         try {
            const { data: agent } = await db.from('wireline_agents')
               .select('name, archetype, role').eq('id', id).eq('user_id', req.user.id).single();
            const review = await claudeBrain.agentReview({
               agentName: agent?.name || 'Wireline Agent',
               archetype: agent?.archetype || 'Receptionist',
               role: agent?.role || DEFAULT_AGENT_ROLE,
               callLogs: logs as any,
            });
            return res.json({
               suggestions: (review.suggested_directives || []).slice(0, 3).map((d: any) => d.directive),
               analysis: review.executive_summary,
               full_review: review,
            });
         } catch (err) {
            console.error("Claude optimize failed; falling back to Gemini:", err);
         }
      }

      // Legacy Gemini fallback
      const prompt = `
        AGENT ID: ${id}
        MISSION LOGS (LAST 10):
        ${logs.map((l, i) => `Log ${i+1}: Summary: ${l.summary}. Transcript: ${l.transcript}`).join('\n\n')}

        TASK: Analyze performance and suggest exactly 3 new tactical directives to improve the agent.
        FORMAT: JSON { "suggestions": string[], "analysis": string }
      `;

      const model = genAI.getGenerativeModel({
         model: "gemini-1.5-pro",
         generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent(prompt);
      const aiText = result.response.text();
      res.json(JSON.parse(aiText || "{}"));
   } catch (e) {
      res.status(500).json({ error: "Optimization protocol failed" });
   }
});

// ==========================================
// 1.9 CONSOLIDATED ACTIVITY FEED (TRIGGER LOG)
// ==========================================
app.get("/api/fleet/activity", authenticateUser, async (req: any, res: any) => {
   try {
      const [logs, tasks, lessons, emails] = await Promise.all([
          db.from('wireline_call_logs').select('id, customer_number, lead_score, intent_label, summary, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_fleet_tasks').select('id, description, status, priority, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_agent_lessons').select('id, lesson, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5),
          db.from('wireline_email_threads').select('id, customer_email, lead_score, intent_label, created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(5)
      ]);

      const activity = [
         ...(logs.data || []).map(l => ({ 
            id: l.id, 
            type: 'SIGNAL_ANALYZED', 
            trigger: 'Voice Ingestion', 
            action: `Intent extracted: ${l.intent_label || 'Analysis Pending'}`, 
            meta: l.customer_number,
            timestamp: l.created_at,
            importance: l.lead_score > 70 ? 'high' : 'medium'
         })),
         ...(tasks.data || []).map(t => ({ 
            id: t.id, 
            type: 'MISSION_INJECTED', 
            trigger: 'Functional Requirement Detected', 
            action: `New Task: ${t.description.substring(0, 50)}...`, 
            meta: t.status,
            timestamp: t.created_at,
            importance: t.priority === 'high' ? 'critical' : 'medium'
         })),
         ...(lessons.data || []).map(l => ({ 
            id: l.id, 
            type: 'NEURAL_OPTIMIZATION', 
            trigger: 'Behavioral Deviation', 
            action: `Lesson Learned: ${l.lesson.substring(0, 50)}...`, 
            meta: 'Agent Refinement',
            timestamp: l.created_at,
            importance: 'low'
         })),
         ...(emails.data || []).map(e => ({ 
            id: e.id, 
            type: 'DIGITAL_RELAY', 
            trigger: 'OMNI_CHANNEL_SYNC', 
            action: `Email Thread Synced: ${e.intent_label || 'Scanning'}`, 
            meta: e.customer_email,
            timestamp: e.created_at,
            importance: 'medium'
         }))
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      res.json({ activity: activity.slice(0, 15) });
   } catch(e) {
      console.error("Activity feed error", e);
      res.status(500).json({ error: "Failed to fetch activity" });
   }
});

// ==========================================
// 1.10 SUPERVISED AGENT TUNING
// ==========================================
app.get("/api/agents/:id/lessons", authenticateUser, async (req: any, res: any) => {
   try {
      const { data: lessons, error } = await db.from('wireline_agent_lessons').select('*')
         .eq('agent_id', req.params.id)
         .eq('user_id', req.user.id)
         .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ lessons });
   } catch (e) {
      res.status(500).json({ error: "Failed to fetch lessons" });
   }
});

app.post("/api/agents/:id/promote", authenticateUser, async (req: any, res: any) => {
   try {
      const { lessonId, content } = req.body;
      // Insert into wireline_directives (the table that agent-config reads from).
      // Priority 5 = medium on the 1-10 scale used throughout the app.
      const { error: promoError } = await db.from('wireline_directives').insert({
         agent_id: req.params.id,
         content: content,
         priority: 5,
         user_id: req.user.id
      });
      if (promoError) throw promoError;

      // Delete the lesson after promotion — verify ownership first
      await db.from('wireline_agent_lessons').delete()
         .eq('id', lessonId)
         .eq('user_id', req.user.id);
      
      res.json({ success: true });
   } catch (e) {
      res.status(500).json({ error: "Promotion failed" });
   }
});

app.delete("/api/agents/:id/lessons/:lessonId", authenticateUser, async (req: any, res: any) => {
   try {
      await db.from('wireline_agent_lessons').delete()
         .eq('id', req.params.lessonId)
         .eq('user_id', req.user.id);
      res.json({ success: true });
   } catch (e) {
      res.status(500).json({ error: "Delete failed" });
   }
});

// ==========================================
//  CLAUDE BRAIN — advanced agent capabilities
// ==========================================

function claudeErr(res: any, e: any) {
  if (e instanceof claudeBrain.ClaudeUnavailableError) {
    return res.status(503).json({
      error: e.message,
      code: "CLAUDE_OFFLINE",
    });
  }
  console.error("Claude endpoint error:", e);
  return res.status(500).json({ error: e?.message ?? "Claude error" });
}

/**
 * Audit middleware — sets up an AsyncLocalStorage context BEFORE the
 * route handler runs. Every Claude API round trip inside the handler
 * records itself into the context. On `res.finish`, fire-and-forget
 * insert into wireline_audit_log so the user's flow is never blocked.
 *
 * Keyed by req.path so /api/claude/brief becomes action='claude.brief'.
 * Apply to /api/claude/* and the Claude-backed insights paths.
 */
function withAudit(actionPrefix: string) {
  return (req: any, res: any, next: any) => {
    const ctx = claudeBrain.createAuditContext();
    res.on("finish", () => {
      if (ctx.records.length === 0) return;
      if (!req?.user?.id) return;        // not authed → don't write
      if (res.statusCode >= 500) return;  // don't bill failed Claude calls
      const subpath = req.path.replace(/\//g, ".").replace(/^\.+/, "");
      const action = `${actionPrefix}${subpath ? "." + subpath : ""}`;
      const rows = ctx.records.map(r => ({
        user_id: req.user.id,
        action,
        provider: r.provider,
        model: r.model,
        input_tokens: r.input_tokens,
        output_tokens: r.output_tokens,
        cache_read_tokens: r.cache_read_tokens,
        cache_create_tokens: r.cache_create_tokens,
        cost_usd: claudeBrain.estimateCost(
          {
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cache_read_input_tokens: r.cache_read_tokens,
            cache_creation_input_tokens: r.cache_create_tokens,
          },
          r.model,
        ),
        latency_ms: r.latency_ms,
        metadata: { method: req.method, path: req.path },
      }));
      const deltaUsd = rows.reduce((s: number, r: any) => s + Number(r.cost_usd || 0), 0);
      // Fire-and-forget; we don't want the user's flow to wait on this.
      Promise.resolve(db.from("wireline_audit_log").insert(rows))
        .then(({ error }: any) => {
          if (error) {
            console.error("Audit insert failed:", error);
            return;
          }
          // After the spend is persisted, evaluate against the budget and
          // fire spend.warning / spend.exceeded webhooks if a threshold
          // crossed. Also fire-and-forget — never block the response.
          evaluateSpend(req.user.id, deltaUsd).catch((err: any) =>
            console.error("evaluateSpend exception:", err),
          );
        })
        .catch((err: any) => console.error("Audit insert exception:", err));
    });
    claudeBrain.runInAuditContext(ctx, () => next());
  };
}

// Auto-instrument every Claude path + the Claude-backed insights paths.
// /status is unauthenticated and doesn't make Claude calls — let it through.
// Otherwise: authenticate → spend hard-cap → audit context → handler.
// Hard-cap is checked BEFORE the audit context is established because
// blocked requests don't make Claude calls so they don't need auditing.
app.use("/api/claude", (req: any, res: any, next: any) => {
  if (req.path === "/status") return next();
  return authenticateUser(req, res, () =>
    enforceSpendCap(req, res, () => withAudit("claude")(req, res, next)),
  );
});
app.use(["/api/insights/topics", "/api/insights/failure-modes", "/api/insights/daily-brief"],
  withAudit("insights"),
);

// Status / health
app.get("/api/claude/status", authenticateUser, async (_req: any, res: any) => {
  res.json({
    available: claudeBrain.isClaudeAvailable(),
    model: "claude-opus-4-7",
    capabilities: [
      "brief", "qualify", "objection-drill", "cold-email",
      "persona-clone", "summarize-thread", "route-intent",
      "smart-draft", "agent-review",
    ],
  });
});

// Pre-call briefing — given a lead, deliver a tactical brief.
app.post("/api/claude/brief", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, customerName, customerNumber, reasonForCall, pastInteractionSummary } = req.body;
    let agentName = "Wireline Agent";
    let agentArchetype = "Receptionist";
    let knowledgeBase: string[] = [];
    let role: string | undefined;

    if (agentId) {
      const [{ data: agent }, { data: knowledge }] = await Promise.all([
        db.from("wireline_agents").select("name, archetype, role").eq("id", agentId).eq("user_id", req.user.id).single(),
        db.from("wireline_knowledge").select("content").eq("agent_id", agentId).eq("user_id", req.user.id),
      ]);
      if (agent) {
        agentName = agent.name;
        agentArchetype = agent.archetype;
        role = agent.role || DEFAULT_AGENT_ROLE;
      }
      knowledgeBase = (knowledge ?? []).map((k: any) => k.content);
    }

    const result = await claudeBrain.brief({
      agentName,
      agentArchetype,
      role,
      customerName,
      customerNumber,
      reasonForCall: reasonForCall || "No specific reason provided.",
      knowledgeBase,
      pastInteractionSummary,
    });
    res.json({ brief: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Lead qualification — BANT scoring, optionally pulled from a call log.
app.post("/api/claude/qualify", authenticateUser, async (req: any, res: any) => {
  try {
    const { source, transcript, callId, threadId, agentId } = req.body;
    let actualTranscript: string = transcript;
    let metadata: Record<string, any> = {};
    let resolvedAgentId: string | undefined = agentId;

    if (!actualTranscript && callId) {
      const { data: call } = await db.from("wireline_call_logs").select("*").eq("id", callId).eq("user_id", req.user.id).single();
      actualTranscript = call?.transcript ?? call?.summary ?? "";
      metadata = { customer_number: call?.customer_number, duration_seconds: call?.duration_seconds };
      if (!resolvedAgentId && call?.agent_id) resolvedAgentId = call.agent_id;
    } else if (!actualTranscript && threadId) {
      const { data: thread } = await db.from("wireline_email_threads").select("agent_id").eq("id", threadId).eq("user_id", req.user.id).single();
      if (!resolvedAgentId && thread?.agent_id) resolvedAgentId = thread.agent_id;
      const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true });
      actualTranscript = (msgs ?? []).map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    }

    if (!actualTranscript) {
      return res.status(400).json({ error: "No transcript provided (and no callId/threadId to fetch from)." });
    }

    let role: string | undefined;
    if (resolvedAgentId) {
      const { data: agent } = await db.from("wireline_agents").select("role").eq("id", resolvedAgentId).eq("user_id", req.user.id).single();
      if (agent) role = agent.role || DEFAULT_AGENT_ROLE;
    }

    const result = await claudeBrain.qualify({
      source: source ?? "voice_call",
      transcript: actualTranscript,
      metadata,
      role,
    });
    res.json({ qualification: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Objection drills — practice scenarios for an agent.
app.post("/api/claude/objection-drill", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, topic, count } = req.body;
    let agentName = "Wireline Agent";
    let archetype = "Receptionist";
    let role: string | undefined;
    if (agentId) {
      const { data: agent } = await db.from("wireline_agents").select("name, archetype, role").eq("id", agentId).eq("user_id", req.user.id).single();
      if (agent) { agentName = agent.name; archetype = agent.archetype; role = agent.role || DEFAULT_AGENT_ROLE; }
    }
    const result = await claudeBrain.objectionDrill({
      agentName, archetype, role,
      topic: topic || "general sales objections",
      count: count ?? 5,
    });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Cold-email composer.
app.post("/api/claude/cold-email", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, ...rest } = req.body ?? {};
    let agentRole: string | undefined = rest.agentRole;
    if (agentId && !agentRole) {
      const { data: agent } = await db.from("wireline_agents").select("role").eq("id", agentId).eq("user_id", req.user.id).single();
      if (agent) agentRole = agent.role || DEFAULT_AGENT_ROLE;
    }
    const result = await claudeBrain.coldEmail({ ...rest, agentRole });
    res.json({ email: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Persona cloning.
app.post("/api/claude/persona-clone", authenticateUser, async (req: any, res: any) => {
  try {
    const { description, samples, agentId, applyToAgent } = req.body;
    if (!Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: "Provide at least one sample message." });
    }
    const result = await claudeBrain.personaClone({
      description: description || "Unknown persona",
      samples,
    });

    if (applyToAgent && agentId) {
      // Verify ownership before applying.
      const { data: agent } = await db.from("wireline_agents").select("id").eq("id", agentId).eq("user_id", req.user.id).single();
      if (agent) {
        await db.from("wireline_personality").upsert({
          agent_id: agentId,
          user_id: req.user.id,
          content: result.persona_block,
        });
      }
    }
    res.json({ persona: result, applied: !!(applyToAgent && agentId) });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Email-thread summarizer.
app.post("/api/claude/summarize-thread", authenticateUser, async (req: any, res: any) => {
  try {
    const { threadId } = req.body;
    const { data: thread } = await db.from("wireline_email_threads").select("subject").eq("id", threadId).eq("user_id", req.user.id).single();
    if (!thread) return res.status(404).json({ error: "Thread not found." });
    const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true });
    const result = await claudeBrain.threadSummary({
      subject: thread.subject || "(no subject)",
      messages: (msgs ?? []) as any,
    });
    res.json({ summary: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Fast intent routing.
app.post("/api/claude/route-intent", authenticateUser, async (req: any, res: any) => {
  try {
    const result = await claudeBrain.routeIntent({ text: req.body.text || "" });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Smart email draft (the better drop-in for the Gemini draft endpoint).
app.post("/api/claude/email-draft", authenticateUser, async (req: any, res: any) => {
  try {
    const { threadId, agentId, userInstructions } = req.body;
    const { data: thread } = await db.from("wireline_email_threads").select("subject, agent_id").eq("id", threadId).eq("user_id", req.user.id).single();
    if (!thread) return res.status(404).json({ error: "Thread not found." });

    const targetAgentId = agentId || thread.agent_id;
    let agentName = "Wireline Agent";
    let agentTone = "Professional";
    let agentRole: string | undefined;
    let agentSignature = "";
    let knowledgeBase: string[] = [];
    let directives: string[] = [];

    if (targetAgentId) {
      const [{ data: agent }, { data: knowledge }, { data: directiveRows }] = await Promise.all([
        db.from("wireline_agents").select("name, email_agent_tone, email_signature, role").eq("id", targetAgentId).eq("user_id", req.user.id).single(),
        db.from("wireline_knowledge").select("content").eq("agent_id", targetAgentId).eq("user_id", req.user.id),
        db.from("wireline_directives").select("content").eq("agent_id", targetAgentId).eq("user_id", req.user.id).order("priority", { ascending: false }),
      ]);
      if (agent) {
        agentName = agent.name;
        agentTone = agent.email_agent_tone || "Professional";
        agentSignature = agent.email_signature || "";
        agentRole = agent.role || DEFAULT_AGENT_ROLE;
      }
      knowledgeBase = (knowledge ?? []).map((k: any) => k.content);
      directives = (directiveRows ?? []).map((d: any) => d.content);
    }

    const { data: msgs } = await db.from("wireline_email_messages").select("role, content").eq("thread_id", threadId).order("created_at", { ascending: true });

    const result = await claudeBrain.smartDraft({
      agentName, agentTone, agentRole, agentSignature,
      knowledgeBase, directives,
      threadSubject: thread.subject || "(no subject)",
      threadMessages: (msgs ?? []) as any,
      userInstructions,
    });

    res.json({
      draft: result.draft,
      diagnostics: { cacheRead: result.cacheRead, cacheCreate: result.cacheCreate },
    });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Deep agent performance review.
app.post("/api/claude/agent-review", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, lookback } = req.body;
    if (!agentId) return res.status(400).json({ error: "agentId required" });
    const { data: agent } = await db.from("wireline_agents").select("name, archetype, role").eq("id", agentId).eq("user_id", req.user.id).single();
    if (!agent) return res.status(404).json({ error: "Agent not found." });
    const { data: logs } = await db
      .from("wireline_call_logs")
      .select("summary, transcript, lead_score, intent_label")
      .eq("agent_id", agentId)
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(Math.min(lookback ?? 15, 30));
    if (!logs || logs.length === 0) {
      return res.status(400).json({ error: "Insufficient data — need at least 1 completed call.", code: "NO_DATA" });
    }
    const result = await claudeBrain.agentReview({
      agentName: agent.name,
      archetype: agent.archetype,
      role: agent.role || DEFAULT_AGENT_ROLE,
      callLogs: logs as any,
    });
    res.json({ review: result, lookback: logs.length });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Promote a Claude-suggested directive into the agent's directive table.
app.post("/api/claude/agent-review/apply-directive", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, directive, priority } = req.body;
    const { data: agent } = await db.from("wireline_agents").select("id").eq("id", agentId).eq("user_id", req.user.id).single();
    if (!agent) return res.status(404).json({ error: "Agent not found." });
    const priorityMap: Record<string, number> = { critical: 10, high: 7, medium: 5, low: 3 };
    await db.from("wireline_directives").insert({
      agent_id: agentId,
      user_id: req.user.id,
      content: directive,
      priority: priorityMap[priority] ?? 5,
    });
    res.json({ success: true });
  } catch (e) {
    claudeErr(res, e);
  }
});

// ──────────────────────────────────────────────────────────
//  OUTBOUND WEBHOOKS — push events to Slack / CRM / Zapier / n8n / etc.
//
//  Subscribed events:
//    call.completed       — every voice call after post-call enrichment
//    call.escalated       — any call where intent_label === 'escalation'
//    lead.hot             — when lead_score >= 70
//    email.received       — every successfully-synced inbound email
//    appointment.booked   — every booking insert
//    task.created         — every fleet_task insert
//    compliance.flagged   — every compliance_review task created
//
//  Each delivery includes:
//    POST <url>
//    Headers:
//      Content-Type: application/json
//      X-Wireline-Event: <event>
//      X-Wireline-Signature: sha256=<hex hmac of body using webhook.secret>
//      X-Wireline-Delivery: <random uuid>
//    Body: { event, timestamp, data }
// ──────────────────────────────────────────────────────────

app.get("/api/webhooks", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from("wireline_webhooks")
      .select("*").eq("user_id", req.user.id).order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ webhooks: data || [], available_events: WEBHOOK_EVENTS });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load webhooks" }); }
});

app.post("/api/webhooks", authenticateUser, async (req: any, res: any) => {
  try {
    const { name, url, events, secret, active } = req.body;
    if (!name || !url || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "name, url, and events[] required." });
    }
    try { new URL(url); } catch { return res.status(400).json({ error: "Invalid URL." }); }
    const bad = events.filter((e: string) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));
    if (bad.length) return res.status(400).json({ error: `Unknown events: ${bad.join(", ")}` });

    const { data, error } = await db.from("wireline_webhooks").insert({
      user_id: req.user.id, name, url, events, secret: secret || null, active: active ?? true,
    }).select().single();
    if (error) throw error;
    res.json({ webhook: data });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to create webhook" }); }
});

app.patch("/api/webhooks/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const patch: any = {};
    for (const k of ["name", "url", "events", "secret", "active"]) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.url) { try { new URL(patch.url); } catch { return res.status(400).json({ error: "Invalid URL." }); } }
    if (patch.events) {
      if (!Array.isArray(patch.events) || patch.events.some((e: string) => !WEBHOOK_EVENTS.includes(e as WebhookEvent))) {
        return res.status(400).json({ error: "Invalid events." });
      }
    }
    const { data, error } = await db.from("wireline_webhooks").update(patch)
      .eq("id", req.params.id).eq("user_id", req.user.id).select().single();
    if (error) throw error;
    res.json({ webhook: data });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to update" }); }
});

app.delete("/api/webhooks/:id", authenticateUser, async (req: any, res: any) => {
  try {
    await db.from("wireline_webhooks").delete().eq("id", req.params.id).eq("user_id", req.user.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to delete" }); }
});

app.post("/api/webhooks/:id/test", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: hook } = await db.from("wireline_webhooks").select("*").eq("id", req.params.id).eq("user_id", req.user.id).single();
    if (!hook) return res.status(404).json({ error: "Webhook not found." });
    await dispatchWebhook(req.user.id, "task.created", {
      test: true, message: "This is a test ping from Wireline.", at: new Date().toISOString(),
    });
    res.json({ success: true, message: "Test dispatched. Check the URL." });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Test failed" }); }
});

// Per-hook delivery history — newest first. Operators use this to
// audit deliveries, see why an integration is silent, and manually
// retry failed/dead deliveries.
app.get("/api/webhooks/:id/deliveries", authenticateUser, async (req: any, res: any) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);
    // Verify ownership before reading deliveries (RLS guards too, but
    // returning a clean 404 is friendlier than an empty list).
    const { data: hook } = await db.from("wireline_webhooks")
      .select("id").eq("id", req.params.id).eq("user_id", req.user.id).maybeSingle();
    if (!hook) return res.status(404).json({ error: "Webhook not found." });
    const { data, error } = await db.from("wireline_webhook_deliveries")
      .select("id, event, attempts, max_attempts, status, last_status_code, last_error, next_attempt_at, delivered_at, created_at")
      .eq("webhook_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ deliveries: data || [] });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load deliveries" }); }
});

// Manually requeue a delivery — clears terminal state and runs an
// attempt right away. Useful after a downstream outage is fixed.
app.post("/api/webhooks/deliveries/:id/retry", authenticateUser, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid delivery id." });
    const { data: row } = await db.from("wireline_webhook_deliveries")
      .select("id, user_id, status").eq("id", id).maybeSingle();
    if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: "Delivery not found." });
    await db.from("wireline_webhook_deliveries").update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      last_status_code: null,
    }).eq("id", id);
    // Fire-and-forget — the inline attempt happens in the background.
    attemptWebhookDelivery(id).catch((err) =>
      log.warn("webhook delivery attempt failed", { delivery_id: id, error: (err as any)?.message || String(err) })
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Retry failed" }); }
});

app.delete("/api/webhooks/deliveries/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid delivery id." });
    await db.from("wireline_webhook_deliveries")
      .delete().eq("id", id).eq("user_id", req.user.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Discard failed" }); }
});

// ──────────────────────────────────────────────────────────
//  INBOUND LEAD INTAKE — public POST endpoint authenticated by a
//  per-user API key (X-Wireline-Key: wlk_…). Lets external systems
//  (Webflow forms, CRMs, Zapier, custom intake) push leads into
//  Wireline. Inserts into wireline_outbound_leads with
//  source='inbound' so the existing dialer + triage surfaces pick
//  them up for free, then fires a lead.received webhook event.
//
//    POST /api/intake/lead
//    Headers:
//      Content-Type: application/json
//      X-Wireline-Key: wlk_<24+ chars>
//    Body:
//      {
//        "customer_name": "Jane Doe",          // optional
//        "customer_number": "+15551234567",    // required (or "phone")
//        "context": "Filled out demo form",    // optional
//        "metadata": { "utm_source": "..." }   // optional, free-form
//      }
//    Returns: { ok: true, lead_id: <bigint> }
// ──────────────────────────────────────────────────────────

const INTAKE_KEY_PREFIX = "wlk_";

async function sha256Hex(value: string): Promise<string> {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function generateIntakeKey(): Promise<{ plaintext: string; prefix: string; hash: string }> {
  const crypto = await import("node:crypto");
  // 32 bytes → 43-char base64url-ish; strip non-alphanumeric for cleanliness.
  const raw = crypto.randomBytes(32).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 36);
  const plaintext = `${INTAKE_KEY_PREFIX}${raw}`;
  const prefix = plaintext.slice(0, 12);
  const hash = await sha256Hex(plaintext);
  return { plaintext, prefix, hash };
}

// Lookup an intake key, return the row (with user_id) or null.
async function resolveIntakeKey(provided: string | undefined): Promise<any | null> {
  if (!provided || typeof provided !== "string" || !provided.startsWith(INTAKE_KEY_PREFIX)) return null;
  const hash = await sha256Hex(provided.trim());
  const { data } = await db.from("wireline_intake_keys")
    .select("id, user_id, name, default_agent_id, active, use_count, auto_dial")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data || !data.active) return null;
  return data;
}

// Per-key in-memory rate limit. Public endpoint, so a single noisy
// caller can't drain the operator's Vapi spend or hammer Supabase.
// Rolling window: ≤ 60 requests per 60s per intake key.
const INTAKE_RATE_WINDOW_MS = 60_000;
const INTAKE_RATE_MAX = 60;
const intakeRateBuckets = new Map<string, number[]>();

function checkIntakeRate(keyId: string): { ok: boolean; retry_after_s?: number } {
  const now = Date.now();
  const cutoff = now - INTAKE_RATE_WINDOW_MS;
  const hits = (intakeRateBuckets.get(keyId) || []).filter(t => t > cutoff);
  if (hits.length >= INTAKE_RATE_MAX) {
    const retryAfter = Math.max(1, Math.ceil((hits[0] + INTAKE_RATE_WINDOW_MS - now) / 1000));
    intakeRateBuckets.set(keyId, hits);
    return { ok: false, retry_after_s: retryAfter };
  }
  hits.push(now);
  intakeRateBuckets.set(keyId, hits);
  return { ok: true };
}

// Purge stale buckets every 5 min (matches the Claude rate-limit pattern).
setInterval(() => {
  const cutoff = Date.now() - INTAKE_RATE_WINDOW_MS * 2;
  for (const [k, hits] of intakeRateBuckets) {
    const fresh = hits.filter(t => t > cutoff);
    if (fresh.length === 0) intakeRateBuckets.delete(k);
    else intakeRateBuckets.set(k, fresh);
  }
}, 5 * 60 * 1000).unref?.();

// Public — no Supabase JWT. Authenticated by X-Wireline-Key header.
//
// Optional Idempotency-Key header — same key + same operator returns
// the original lead_id with idempotent_replay: true. Unique partial
// index on (user_id, idempotency_key) enforces this in Postgres.
//
// auto_dial — when set on the intake key AND a default_agent_id is
// available (or one was provided in the body), we kick off an outbound
// Vapi call right after the lead is recorded. Fire-and-forget so the
// HTTP response stays fast.
// Single-lead processor — shared between /api/intake/lead and the
// bulk variant. Returns a structured result so the bulk endpoint can
// aggregate per-lead success / failure without partial-failure
// rolling back the rest of the batch.
type IntakeLeadInput = {
  customer_number?: string;
  phone?: string;
  phone_number?: string;
  customer_name?: string;
  name?: string;
  context?: string;
  message?: string;
  metadata?: any;
  agent_id?: string;
  idempotency_key?: string;
};

type IntakeLeadResult = {
  ok: boolean;
  lead_id?: number;
  status?: string;
  call_id?: string | null;
  idempotent_replay?: boolean;
  auto_dial_initiated?: boolean;
  error?: string;
  code?: string;
};

async function processIntakeLead(key: any, input: IntakeLeadInput, idemHeaderOverride?: string | null): Promise<IntakeLeadResult> {
  const customer_number = (input.customer_number || input.phone || input.phone_number || "").toString().trim();
  if (!customer_number) {
    return { ok: false, error: "customer_number (or phone) is required.", code: "MISSING_NUMBER" };
  }

  const customer_name = (input.customer_name || input.name || "").toString().slice(0, 200);
  const context = (input.context || input.message || "").toString().slice(0, 4000);
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : null;
  const agent_id = input.agent_id || key.default_agent_id || null;
  const idemKey = (idemHeaderOverride !== undefined ? idemHeaderOverride : (input.idempotency_key || null));
  const idemKeyTrimmed = idemKey ? String(idemKey).trim().slice(0, 255) : null;

  if (idemKeyTrimmed) {
    const { data: existing } = await db.from("wireline_outbound_leads")
      .select("id, call_id, status")
      .eq("user_id", key.user_id)
      .eq("idempotency_key", idemKeyTrimmed)
      .maybeSingle();
    if (existing) {
      return {
        ok: true,
        lead_id: existing.id,
        idempotent_replay: true,
        status: existing.status,
        call_id: existing.call_id,
        auto_dial_initiated: false,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const { data: inserted, error } = await db.from("wireline_outbound_leads").insert({
    user_id: key.user_id,
    agent_id,
    customer_name: customer_name || null,
    customer_number,
    phone_number: customer_number,
    context: context || null,
    status: "Pending",
    source: "inbound",
    metadata,
    received_at: nowIso,
    idempotency_key: idemKeyTrimmed,
  }).select("id").single();

  if (error) {
    if (idemKeyTrimmed && (error.code === "23505" || /duplicate key/i.test(error.message || ""))) {
      const { data: replay } = await db.from("wireline_outbound_leads")
        .select("id, call_id, status")
        .eq("user_id", key.user_id)
        .eq("idempotency_key", idemKeyTrimmed)
        .maybeSingle();
      if (replay) {
        return {
          ok: true,
          lead_id: replay.id,
          idempotent_replay: true,
          status: replay.status,
          call_id: replay.call_id,
          auto_dial_initiated: false,
        };
      }
    }
    return { ok: false, error: error.message || "DB insert failed", code: "INSERT_FAILED" };
  }

  // Fan out to operator's outbound webhooks.
  dispatchWebhook(key.user_id, "lead.received", {
    lead_id: inserted?.id,
    customer_name: customer_name || null,
    customer_number,
    context: context || null,
    metadata,
    agent_id,
    intake_key: { id: key.id, name: key.name },
    auto_dial: !!key.auto_dial && !!agent_id,
    at: nowIso,
  }).catch((err) =>
    log.warn("lead.received webhook dispatch failed", {
      user_id: key.user_id,
      error: (err as any)?.message || String(err),
    })
  );

  let auto_dial_initiated = false;
  if (key.auto_dial && agent_id && inserted?.id) {
    auto_dial_initiated = true;
    (async () => {
      try {
        const result = await placeOutboundCall({
          userId: key.user_id,
          agentId: agent_id,
          customerName: customer_name || null,
          customerNumber: customer_number,
          context: context || `Inbound lead via ${key.name}`,
        });
        if (result.ok) {
          await db.from("wireline_outbound_leads").update({
            call_id: result.callId,
            status: "Dialing",
            last_called_at: new Date().toISOString(),
          }).eq("id", inserted.id);
        } else {
          await db.from("wireline_outbound_leads").update({
            status: "AutoDialFailed",
            metadata: { ...(metadata || {}), auto_dial_error: result.error, auto_dial_status: result.status },
          }).eq("id", inserted.id);
          console.warn(`Auto-dial failed for lead ${inserted.id}: [${result.status}] ${result.error}`);
        }
      } catch (err: any) {
        await db.from("wireline_outbound_leads").update({
          status: "AutoDialFailed",
          metadata: { ...(metadata || {}), auto_dial_error: err?.message || String(err) },
        }).eq("id", inserted.id);
        console.warn(`Auto-dial threw for lead ${inserted.id}:`, err);
      }
    })();
  }

  return {
    ok: true,
    lead_id: inserted?.id,
    idempotent_replay: false,
    auto_dial_initiated,
  };
}

app.post("/api/intake/lead", async (req: any, res: any) => {
  try {
    const provided = req.headers["x-wireline-key"] as string | undefined;
    const key = await resolveIntakeKey(provided);
    if (!key) return res.status(401).json({ error: "Invalid or missing X-Wireline-Key." });

    const rate = checkIntakeRate(key.id);
    if (!rate.ok) {
      res.set("Retry-After", String(rate.retry_after_s));
      return res.status(429).json({
        error: `Rate limit exceeded for this intake key (${INTAKE_RATE_MAX}/min). Retry in ${rate.retry_after_s}s.`,
        code: "INTAKE_RATE_LIMIT",
        retry_after_s: rate.retry_after_s,
      });
    }

    const idemHeader = (req.headers["idempotency-key"] as string | undefined)?.toString().trim() || null;
    const result = await processIntakeLead(key, req.body || {}, idemHeader);

    if (result.ok) {
      // Bump usage stats fire-and-forget — only on real (not replayed) inserts.
      if (!result.idempotent_replay) {
        const nowIso = new Date().toISOString();
        db.from("wireline_intake_keys").update({
          last_used_at: nowIso,
          use_count: (key.use_count || 0) + 1,
        }).eq("id", key.id).then(() => {}, () => {});
      }
      return res.json(result);
    }
    const status = result.code === "MISSING_NUMBER" ? 400 : 500;
    return res.status(status).json({ error: result.error, code: result.code });
  } catch (e: any) {
    console.error("Intake lead failed:", e);
    res.status(500).json({ error: e?.message ?? "Intake failed" });
  }
});

// Bulk intake — accept up to BULK_MAX leads per request. Each lead
// counts as one rate-limit hit; if the batch would exceed the
// per-key bucket, the whole request is rejected with 429 (so the
// caller can split it sensibly rather than getting partial success).
//
// Per-lead idempotency_key in the body is supported (the request-level
// Idempotency-Key header is intentionally ignored here — wouldn't make
// sense to apply one key to a batch of distinct leads).
const INTAKE_BULK_MAX = 100;

app.post("/api/intake/leads", async (req: any, res: any) => {
  try {
    const provided = req.headers["x-wireline-key"] as string | undefined;
    const key = await resolveIntakeKey(provided);
    if (!key) return res.status(401).json({ error: "Invalid or missing X-Wireline-Key." });

    const leads = Array.isArray(req.body?.leads) ? req.body.leads : null;
    if (!leads || leads.length === 0) {
      return res.status(400).json({ error: "leads must be a non-empty array.", code: "EMPTY_BATCH" });
    }
    if (leads.length > INTAKE_BULK_MAX) {
      return res.status(400).json({
        error: `Batch too large. Max ${INTAKE_BULK_MAX} leads per request.`,
        code: "BATCH_TOO_LARGE",
        max: INTAKE_BULK_MAX,
      });
    }

    // Reserve N slots in the rate bucket up front; reject the whole
    // batch if any slot would overflow so the caller can chunk.
    for (let i = 0; i < leads.length; i++) {
      const r = checkIntakeRate(key.id);
      if (!r.ok) {
        res.set("Retry-After", String(r.retry_after_s));
        return res.status(429).json({
          error: `Rate limit would be exceeded by this batch (${INTAKE_RATE_MAX}/min). Retry in ${r.retry_after_s}s.`,
          code: "INTAKE_RATE_LIMIT",
          retry_after_s: r.retry_after_s,
          accepted_so_far: i,
        });
      }
    }

    // Process leads concurrently. Per-lead errors are captured into
    // the results array so a single bad row doesn't fail the rest.
    const results = await Promise.all(
      (leads as IntakeLeadInput[]).map((lead) => processIntakeLead(key, lead).catch((err: any) => ({
        ok: false,
        error: err?.message || String(err),
        code: "PROCESS_FAILED",
      } as IntakeLeadResult))),
    );

    const successes = results.filter(r => r.ok).length;
    if (successes > 0) {
      const nowIso = new Date().toISOString();
      db.from("wireline_intake_keys").update({
        last_used_at: nowIso,
        use_count: (key.use_count || 0) + successes,
      }).eq("id", key.id).then(() => {}, () => {});
    }

    res.json({
      ok: true,
      count: leads.length,
      success_count: successes,
      failure_count: leads.length - successes,
      results,
    });
  } catch (e: any) {
    console.error("Bulk intake failed:", e);
    res.status(500).json({ error: e?.message ?? "Bulk intake failed" });
  }
});

// Per-user CRUD on intake keys. Plaintext is returned ONLY at create
// time; subsequent reads expose the prefix only.
app.get("/api/intake/keys", authenticateUser, async (req: any, res: any) => {
  try {
    const { data, error } = await db.from("wireline_intake_keys")
      .select("id, name, key_prefix, default_agent_id, auto_dial, active, last_used_at, use_count, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ keys: data || [] });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load keys" }); }
});

app.post("/api/intake/keys", authenticateUser, async (req: any, res: any) => {
  try {
    const name = (req.body?.name || "").toString().trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    const default_agent_id = req.body?.default_agent_id || null;
    const auto_dial = !!req.body?.auto_dial;

    const { plaintext, prefix, hash } = await generateIntakeKey();
    const { data, error } = await db.from("wireline_intake_keys").insert({
      user_id: req.user.id,
      name: name.slice(0, 80),
      key_prefix: prefix,
      key_hash: hash,
      default_agent_id,
      auto_dial,
      active: true,
    }).select("id, name, key_prefix, default_agent_id, auto_dial, active, created_at").single();
    if (error) throw error;
    // Plaintext is returned ONCE — we never store or expose it again.
    res.json({ key: data, plaintext });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to create key" }); }
});

app.patch("/api/intake/keys/:id", authenticateUser, async (req: any, res: any) => {
  try {
    const patch: any = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name).slice(0, 80);
    if (req.body?.active !== undefined) patch.active = !!req.body.active;
    if (req.body?.default_agent_id !== undefined) patch.default_agent_id = req.body.default_agent_id || null;
    if (req.body?.auto_dial !== undefined) patch.auto_dial = !!req.body.auto_dial;
    const { data, error } = await db.from("wireline_intake_keys").update(patch)
      .eq("id", req.params.id).eq("user_id", req.user.id)
      .select("id, name, key_prefix, default_agent_id, auto_dial, active, last_used_at, use_count, created_at").single();
    if (error) throw error;
    res.json({ key: data });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to update key" }); }
});

app.delete("/api/intake/keys/:id", authenticateUser, async (req: any, res: any) => {
  try {
    await db.from("wireline_intake_keys").delete().eq("id", req.params.id).eq("user_id", req.user.id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to delete key" }); }
});

// ──────────────────────────────────────────────────────────
//  SCHEDULED DAILY BRIEF — emails Claude's morning brief to the
//  operator at a configured UTC time via their connected Gmail.
//  - Background scheduler ticks every 5 minutes; sends to any user
//    whose daily_brief_send_at has elapsed today and who hasn't
//    been sent for the current UTC date yet.
//  - HTML email rendered server-side (no inline images, just well-
//    structured semantic HTML for max client compatibility).
//  - Per-send error stored on settings.daily_brief_last_error so
//    the operator can see why if delivery is silent.
// ──────────────────────────────────────────────────────────

function buildOAuthClient() {
  // Token refresh doesn't require an accurate redirect_uri — Google
  // only validates redirect on the auth-code exchange. Pass APP_URL
  // when set so any token-server callbacks have a sane URL anyway.
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.APP_URL ? `${process.env.APP_URL}/api/oauth/google/callback` : undefined,
  );
}

function escapeHtml(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderDailyBriefEmail(payload: any, opts: { dateLabel: string; appUrl?: string | null }): { subject: string; html: string; text: string } {
  const brief = payload?.brief || {};
  const stats = payload?.stats_yesterday || {};
  const delta = payload?.week_delta || {};
  const headline = brief.headline || "Your daily brief";
  const mood = brief.mood || "neutral";
  const highlights: string[] = brief.highlights || [];
  const concerns: string[] = brief.concerns || [];
  const actions: string[] = brief.action_items || [];

  const moodColor = mood === "positive" ? "#10b981" : mood === "concerning" ? "#f43f5e" : "#7DF9FF";
  const fmtPct = (n: any) => {
    const v = Number(n || 0);
    const sign = v >= 0 ? "+" : "";
    return `${sign}${v.toFixed(0)}%`;
  };
  const link = opts.appUrl ? `${opts.appUrl.replace(/\/+$/, "")}/` : null;

  const subject = `Wireline · ${escapeHtml(headline)} · ${opts.dateLabel}`;

  const css = `
    body { margin:0; padding:0; background:#0F0E2D; color:#EEF1F8; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
    .wrap { max-width:640px; margin:0 auto; padding:32px 16px; }
    .card { background:#191734; border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:28px; margin-bottom:16px; }
    .label { font-size:10px; letter-spacing:0.4em; text-transform:uppercase; color:#8E91A8; margin:0 0 12px; }
    h1 { font-size:28px; line-height:1.15; margin:0 0 8px; color:#fff; font-weight:600; letter-spacing:-0.01em; }
    h2 { font-size:13px; letter-spacing:0.3em; text-transform:uppercase; color:${moodColor}; margin:0 0 16px; }
    p { color:rgba(238,241,248,0.8); line-height:1.55; margin:0 0 12px; font-size:14px; }
    .stats { display:table; width:100%; border-collapse:separate; border-spacing:8px 0; margin-top:8px; }
    .stat { display:table-cell; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:14px; text-align:center; vertical-align:top; }
    .stat .v { font-size:22px; font-weight:600; color:#fff; line-height:1; }
    .stat .l { font-size:10px; letter-spacing:0.25em; text-transform:uppercase; color:#8E91A8; margin-top:8px; }
    .delta-pos { color:#4DFFC4; }
    .delta-neg { color:#FF6BD9; }
    ul { padding:0; margin:0; list-style:none; }
    li { background:rgba(255,255,255,0.03); border-left:3px solid ${moodColor}; border-radius:6px; padding:10px 14px; margin-bottom:8px; font-size:14px; line-height:1.5; color:rgba(238,241,248,0.9); }
    li.warn { border-left-color:#FFC07D; }
    li.action { border-left-color:#7DF9FF; }
    .footer { text-align:center; color:#8E91A8; font-size:11px; padding:16px 0; }
    .btn { display:inline-block; padding:10px 18px; border-radius:999px; background:linear-gradient(135deg,#7DF9FF,#C58BFF); color:#0F0E2D !important; text-decoration:none; font-weight:600; font-size:13px; letter-spacing:0.05em; }
  `;

  const stat = (label: string, value: string, delta?: number | null) => `
    <div class="stat">
      <div class="v">${escapeHtml(value)}</div>
      <div class="l">${escapeHtml(label)}</div>
      ${delta !== undefined && delta !== null && Math.abs(delta) >= 1
        ? `<div class="${delta >= 0 ? "delta-pos" : "delta-neg"}" style="font-size:11px;margin-top:6px;">${fmtPct(delta)} vs 7-day</div>`
        : ""}
    </div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" /><style>${css}</style></head><body>
    <div class="wrap">
      <div class="card">
        <p class="label">Wireline · Daily Brief · ${escapeHtml(opts.dateLabel)}</p>
        <h2>${escapeHtml(mood)}</h2>
        <h1>${escapeHtml(headline)}</h1>
        <div class="stats" role="presentation">
          ${stat("Calls", String(stats.total_calls ?? 0), delta.calls_pct)}
          ${stat("Lead Score", String(stats.avg_lead_score ?? 0), delta.score_pct)}
          ${stat("Cost", `$${Number(stats.cost ?? 0).toFixed(2)}`, delta.cost_pct)}
          ${stat("Booked", String(stats.appointments_booked ?? 0))}
        </div>
      </div>
      ${highlights.length ? `
      <div class="card">
        <p class="label">Highlights</p>
        <ul>${highlights.map(h => `<li>${escapeHtml(h)}</li>`).join("")}</ul>
      </div>` : ""}
      ${concerns.length ? `
      <div class="card">
        <p class="label">Concerns</p>
        <ul>${concerns.map(h => `<li class="warn">${escapeHtml(h)}</li>`).join("")}</ul>
      </div>` : ""}
      ${actions.length ? `
      <div class="card">
        <p class="label">Action Items</p>
        <ul>${actions.map(h => `<li class="action">${escapeHtml(h)}</li>`).join("")}</ul>
      </div>` : ""}
      ${link ? `<div style="text-align:center; padding:12px 0 32px;"><a class="btn" href="${escapeHtml(link)}">Open Wireline</a></div>` : ""}
      <div class="footer">Sent automatically from your scheduled daily brief. Pause anytime in <strong>Command Atlas → Daily Brief</strong>.</div>
    </div>
  </body></html>`;

  // Plain-text fallback for clients that don't render HTML.
  const lines: string[] = [];
  lines.push(`WIRELINE · Daily Brief · ${opts.dateLabel}`);
  lines.push(`Mood: ${mood}`);
  lines.push("");
  lines.push(headline);
  lines.push("");
  lines.push(`Calls: ${stats.total_calls ?? 0}  ·  Lead Score: ${stats.avg_lead_score ?? 0}  ·  Cost: $${Number(stats.cost ?? 0).toFixed(2)}  ·  Booked: ${stats.appointments_booked ?? 0}`);
  if (highlights.length) { lines.push(""); lines.push("HIGHLIGHTS"); highlights.forEach(h => lines.push(` • ${h}`)); }
  if (concerns.length)   { lines.push(""); lines.push("CONCERNS");   concerns.forEach(h => lines.push(` ⚠ ${h}`)); }
  if (actions.length)    { lines.push(""); lines.push("ACTIONS");    actions.forEach(h => lines.push(` → ${h}`)); }
  if (link) { lines.push(""); lines.push(`Open Wireline: ${link}`); }
  return { subject, html, text: lines.join("\n") };
}

async function sendDailyBriefEmail(userId: string, opts?: { force?: boolean }) {
  // Pull settings + the operator's connected Gmail account.
  const [{ data: settings }, { data: accounts }] = await Promise.all([
    db.from("wireline_settings").select("daily_brief_recipient, daily_brief_enabled").eq("user_id", userId).maybeSingle(),
    db.from("wireline_email_accounts").select("access_token, refresh_token, expires_at, email_address").eq("user_id", userId).limit(1),
  ]);
  const recipient = settings?.daily_brief_recipient;
  if (!recipient) throw new Error("No recipient configured (daily_brief_recipient).");
  const account: any = accounts?.[0];
  if (!account?.refresh_token) throw new Error("No connected Gmail account — connect one in Carrier Bridge first.");

  // Compute the brief (uses the per-day cache) — may throw CLAUDE_OFFLINE.
  const { payload } = await computeDailyBrief(userId, { force: opts?.force === true });
  const dateLabel = new Date().toISOString().slice(0, 10);
  const { subject, html, text } = renderDailyBriefEmail(payload, { dateLabel, appUrl: process.env.APP_URL });

  const oauth2Client = buildOAuthClient();
  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at,
  });
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Multipart/alternative — text part first, then HTML, per RFC 2046.
  const boundary = `----wirelineboundary${Date.now().toString(36)}`;
  const messageParts = [
    `From: ${account.email_address || "me"}`,
    `To: ${recipient}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ].join("\r\n");
  const encoded = Buffer.from(messageParts).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });

  return { recipient, subject };
}

// Scheduler — every 5 minutes, find any users whose configured time
// has elapsed today and haven't been sent yet (UTC date comparison).
// .unref() so it never blocks process exit. Re-entrancy guard so a
// slow batch doesn't overlap with itself.
const DAILY_BRIEF_TICK_MS = 5 * 60 * 1000;
let _briefSchedRunning = false;

async function processScheduledDailyBriefs() {
  if (_briefSchedRunning) return;
  _briefSchedRunning = true;
  try {
    const now = new Date();
    const utcHHMM = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;
    const todayUTC = now.toISOString().slice(0, 10);

    // Pull users whose send_at <= now (lex compare HH:MM works) AND
    // either never sent or last send was on an earlier UTC date.
    const { data: due } = await db.from("wireline_settings")
      .select("user_id, daily_brief_send_at, daily_brief_last_sent_at")
      .eq("daily_brief_enabled", true)
      .lte("daily_brief_send_at", utcHHMM)
      .limit(500);
    if (!due?.length) return;

    for (const row of due) {
      const lastDate = row.daily_brief_last_sent_at
        ? new Date(row.daily_brief_last_sent_at).toISOString().slice(0, 10)
        : null;
      if (lastDate === todayUTC) continue;

      try {
        await sendDailyBriefEmail(row.user_id);
        await db.from("wireline_settings").update({
          daily_brief_last_sent_at: new Date().toISOString(),
          daily_brief_last_error: null,
        }).eq("user_id", row.user_id);
      } catch (err: any) {
        // Persist the error so the operator can see why delivery failed,
        // but DON'T mark sent — we'll retry on the next tick.
        const message = err?.message || String(err);
        await db.from("wireline_settings").update({
          daily_brief_last_error: message.slice(0, 500),
        }).eq("user_id", row.user_id);
        console.warn(`Daily-brief send failed for ${row.user_id}:`, message);
      }
    }
  } catch (err) {
    console.error("Daily-brief scheduler tick failed:", err);
  } finally {
    _briefSchedRunning = false;
  }
}
setInterval(processScheduledDailyBriefs, DAILY_BRIEF_TICK_MS).unref?.();

// Settings: GET / PUT for the daily-brief schedule. Defaults are
// reasonable: 13:00 UTC (~9am ET / 6am PT), recipient = user's email,
// disabled until the operator opts in.
app.get("/api/daily-brief/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const { data } = await db.from("wireline_settings")
      .select("daily_brief_enabled, daily_brief_send_at, daily_brief_recipient, daily_brief_last_sent_at, daily_brief_last_error")
      .eq("user_id", req.user.id).maybeSingle();
    const { data: accounts } = await db.from("wireline_email_accounts")
      .select("email_address").eq("user_id", req.user.id).limit(1);
    res.json({
      settings: {
        enabled: !!data?.daily_brief_enabled,
        send_at: data?.daily_brief_send_at || "13:00",
        recipient: data?.daily_brief_recipient || req.user.email || null,
        last_sent_at: data?.daily_brief_last_sent_at || null,
        last_error: data?.daily_brief_last_error || null,
      },
      gmail_connected: !!accounts?.[0]?.email_address,
      gmail_address: accounts?.[0]?.email_address || null,
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load settings" }); }
});

app.put("/api/daily-brief/settings", authenticateUser, async (req: any, res: any) => {
  try {
    const enabled = req.body?.enabled === true;
    const send_at = (req.body?.send_at || "13:00").toString();
    if (!/^\d{2}:\d{2}$/.test(send_at)) return res.status(400).json({ error: "send_at must be HH:MM (UTC)." });
    const [hh, mm] = send_at.split(":").map(Number);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return res.status(400).json({ error: "send_at must be a valid HH:MM." });
    const recipient = (req.body?.recipient || "").toString().trim() || null;
    if (recipient && !/^\S+@\S+\.\S+$/.test(recipient)) return res.status(400).json({ error: "recipient must be a valid email." });

    await db.from("wireline_settings").upsert({
      user_id: req.user.id,
      daily_brief_enabled: enabled,
      daily_brief_send_at: send_at,
      daily_brief_recipient: recipient,
    }, { onConflict: "user_id" });

    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to save settings" }); }
});

// Send-now — operator-triggered preview email so they can confirm
// the schedule works before relying on the morning send. Doesn't
// touch daily_brief_last_sent_at so the scheduled send still fires.
app.post("/api/daily-brief/send-now", authenticateUser, async (req: any, res: any) => {
  try {
    const result = await sendDailyBriefEmail(req.user.id, { force: true });
    res.json({ success: true, ...result });
  } catch (e: any) {
    if (e?.code === "CLAUDE_OFFLINE") return res.status(503).json({ error: e.message, code: e.code });
    res.status(500).json({ error: e?.message ?? "Send failed" });
  }
});

// ──────────────────────────────────────────────────────────
//  AUDIT LOG — token + cost visibility for every Claude call.
// ──────────────────────────────────────────────────────────

// Aggregate spend summary — powers the AI-Spend dashboard tab.
app.get("/api/audit/summary", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: rows } = await db
      .from("wireline_audit_log")
      .select("action, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_create_tokens, cost_usd, latency_ms, created_at")
      .eq("user_id", req.user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);

    const all = rows || [];
    const num = (n: any) => Number(n || 0);

    // Totals
    const totals = all.reduce((acc: any, r: any) => {
      acc.calls += 1;
      acc.cost += num(r.cost_usd);
      acc.input += num(r.input_tokens);
      acc.output += num(r.output_tokens);
      acc.cache_read += num(r.cache_read_tokens);
      acc.cache_create += num(r.cache_create_tokens);
      return acc;
    }, { calls: 0, cost: 0, input: 0, output: 0, cache_read: 0, cache_create: 0 });

    // Cache savings — what we'd have paid if cache_read tokens were full-price input.
    // 0.10x rate means we save 0.90x the equivalent input cost.
    const inputRate = (model: string) =>
      model?.includes("haiku") ? 1 : model?.includes("sonnet") ? 3 : 5;
    const cacheSavings = all.reduce((s: number, r: any) =>
      s + (num(r.cache_read_tokens) * inputRate(r.model) * 0.90) / 1_000_000, 0);

    // By day
    const byDayMap: Record<string, { day: string; calls: number; cost: number }> = {};
    for (const r of all) {
      const day = (r.created_at || "").slice(0, 10);
      const b = byDayMap[day] ||= { day, calls: 0, cost: 0 };
      b.calls += 1;
      b.cost += num(r.cost_usd);
    }
    const byDay = Object.values(byDayMap).sort((a, b) => a.day.localeCompare(b.day));

    // By action
    const byActionMap: Record<string, { action: string; calls: number; cost: number; avg_latency_ms: number; _latencySum: number }> = {};
    for (const r of all) {
      const a = byActionMap[r.action] ||= { action: r.action, calls: 0, cost: 0, avg_latency_ms: 0, _latencySum: 0 };
      a.calls += 1;
      a.cost += num(r.cost_usd);
      a._latencySum += num(r.latency_ms);
    }
    const byAction = Object.values(byActionMap).map(a => {
      a.avg_latency_ms = Math.round(a._latencySum / Math.max(1, a.calls));
      delete (a as any)._latencySum;
      return a;
    }).sort((a, b) => b.cost - a.cost);

    // By model
    const byModelMap: Record<string, { model: string; calls: number; cost: number }> = {};
    for (const r of all) {
      const key = r.model || "unknown";
      const m = byModelMap[key] ||= { model: key, calls: 0, cost: 0 };
      m.calls += 1;
      m.cost += num(r.cost_usd);
    }
    const byModel = Object.values(byModelMap).sort((a, b) => b.cost - a.cost);

    res.json({
      window_days: days,
      totals: {
        ...totals,
        cost: Number(totals.cost.toFixed(4)),
        cache_savings_usd: Number(cacheSavings.toFixed(4)),
        avg_cost_per_call: totals.calls ? Number((totals.cost / totals.calls).toFixed(4)) : 0,
      },
      by_day: byDay.map(d => ({ ...d, cost: Number(d.cost.toFixed(4)) })),
      by_action: byAction.map(a => ({ ...a, cost: Number(a.cost.toFixed(4)) })),
      by_model: byModel.map(m => ({ ...m, cost: Number(m.cost.toFixed(4)) })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Audit summary failed" });
  }
});

// Recent audit entries — for debugging + compliance trail.
app.get("/api/audit/recent", authenticateUser, async (req: any, res: any) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "100"), 500);
    const { data, error } = await db
      .from("wireline_audit_log")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Audit fetch failed" });
  }
});

// ──────────────────────────────────────────────────────────
//  SPEND BUDGET — monthly Claude limit, hard-cap toggle,
//  warn-threshold %. Composed with the audit log + outbound webhooks
//  to give operators a real safety net for LLM bills.
// ──────────────────────────────────────────────────────────

app.get("/api/spend/budget", authenticateUser, async (req: any, res: any) => {
  try {
    const { data } = await db.from("wireline_spend_budgets")
      .select("monthly_limit_usd, hard_cap, warn_threshold_pct, enabled, updated_at")
      .eq("user_id", req.user.id).maybeSingle();
    res.json({
      budget: data || {
        monthly_limit_usd: 0,
        hard_cap: false,
        warn_threshold_pct: 80,
        enabled: true,
        updated_at: null,
      },
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load budget" }); }
});

app.put("/api/spend/budget", authenticateUser, async (req: any, res: any) => {
  try {
    const limit = Number(req.body.monthly_limit_usd ?? 0);
    const warn = Math.round(Number(req.body.warn_threshold_pct ?? 80));
    const hardCap = !!req.body.hard_cap;
    const enabled = req.body.enabled !== false;
    if (!Number.isFinite(limit) || limit < 0) return res.status(400).json({ error: "monthly_limit_usd must be a non-negative number" });
    if (!Number.isInteger(warn) || warn < 1 || warn > 99) return res.status(400).json({ error: "warn_threshold_pct must be 1–99" });

    const { data, error } = await db.from("wireline_spend_budgets")
      .upsert({
        user_id: req.user.id,
        monthly_limit_usd: limit,
        hard_cap: hardCap,
        warn_threshold_pct: warn,
        enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select().single();
    if (error) throw error;
    // Force a cache refresh so the new limit takes effect on the next request.
    budgetCache.delete(req.user.id);
    res.json({ budget: data });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to save budget" }); }
});

app.get("/api/spend/status", authenticateUser, async (req: any, res: any) => {
  try {
    const snap = await getBudgetSnapshot(req.user.id, true);
    const { data: alerts } = await db.from("wireline_spend_alerts")
      .select("threshold_pct, fired_at")
      .eq("user_id", req.user.id).eq("period", snap.period)
      .order("threshold_pct", { ascending: true });
    const limit = snap.budget?.monthly_limit_usd || 0;
    const pct = limit > 0 ? (snap.mtdCost / limit) * 100 : 0;
    res.json({
      period: snap.period,
      month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
      monthly_limit_usd: limit,
      percent_used: Number(pct.toFixed(1)),
      hard_cap: snap.budget?.hard_cap ?? false,
      enabled: snap.budget?.enabled ?? true,
      warn_threshold_pct: snap.budget?.warn_threshold_pct ?? 80,
      hard_capped_now: !!(snap.budget?.hard_cap && limit > 0 && snap.mtdCost >= limit),
      alerts_fired: alerts || [],
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load spend status" }); }
});

// ──────────────────────────────────────────────────────────
//  STRIPE BILLING — checkout, portal, status. Webhook handler
//  lives at module scope (above) so it can use raw-body parsing.
// ──────────────────────────────────────────────────────────

function billingBaseUrl(req: any): string {
  // Honor APP_URL when set (production). Otherwise fall back to the
  // Origin header so dev sandboxes work without env config.
  return (process.env.APP_URL || req.get("origin") || "http://localhost:3000").replace(/\/+$/, "");
}

// Public — anyone can read the catalog (renders pre-auth on the
// pricing surface in the future). No secrets are exposed.
app.get("/api/billing/plans", (_req: any, res: any) => {
  res.json({ plans: plansForClient(), stripe_configured: stripeAvailable() });
});

// Operator-facing read of their current sub.
app.get("/api/billing/status", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: sub } = await db.from("wireline_subscriptions")
      .select("plan, status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, updated_at")
      .eq("user_id", req.user.id).maybeSingle();
    const planMeta = sub?.plan ? planById(sub.plan) : null;
    res.json({
      stripe_configured: stripeAvailable(),
      subscription: sub ? {
        plan: sub.plan,
        plan_name: planMeta?.name || null,
        max_agents: planMeta?.max_agents || null,
        status: sub.status,
        current_period_end: sub.current_period_end,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        has_customer: !!sub.stripe_customer_id,
        has_subscription: !!sub.stripe_subscription_id,
        updated_at: sub.updated_at,
      } : null,
    });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Failed to load status" }); }
});

// Start a Stripe Checkout session for a plan. Idempotent on
// stripe_customer_id — we re-use the customer across upgrades so
// invoices and payment methods carry forward.
app.post("/api/billing/checkout", authenticateUser, async (req: any, res: any) => {
  try {
    if (!stripeAvailable()) return res.status(503).json({ error: "Stripe not configured." });
    const planId = String(req.body?.plan_id || "").trim();
    const plan = planById(planId);
    if (!plan) return res.status(400).json({ error: "Unknown plan_id." });
    const priceId = process.env[plan.priceIdEnv];
    if (!priceId) return res.status(503).json({ error: `Price for plan '${plan.id}' not configured (${plan.priceIdEnv}).` });

    // Find the existing Stripe row first — we need to gate against
    // double-subscribing AND we'll re-use the customer if present.
    const { data: existing } = await db.from("wireline_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status, plan")
      .eq("user_id", req.user.id).maybeSingle();

    // Block creating a second concurrent subscription. Stripe permits
    // multiple subs per customer unless we explicitly prevent it; our
    // wireline_subscriptions row only tracks ONE stripe_subscription_id
    // so a second checkout would silently double-charge the operator
    // and leave the second sub orphaned in Stripe. Plan changes go
    // through the Customer Portal (clean proration, single sub) — the
    // UI redirects there when an active sub already exists.
    const liveStatuses = new Set(["active", "trialing", "past_due", "incomplete", "unpaid"]);
    if (existing?.stripe_subscription_id && liveStatuses.has(existing.status || "")) {
      return res.status(409).json({
        error:
          "You already have an active subscription. Use the Customer Portal to change plans " +
          "(this avoids creating a second concurrent subscription).",
        code: "ALREADY_SUBSCRIBED",
        current_plan: existing.plan,
        current_status: existing.status,
      });
    }

    // Find or create the Stripe Customer for this user.
    let customerId = existing?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { wireline_user_id: req.user.id },
      });
      customerId = customer.id;
      await db.from("wireline_subscriptions").upsert({
        user_id: req.user.id,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }

    const base = billingBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/admin?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/admin?billing=canceled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { wireline_user_id: req.user.id, wireline_plan: plan.id },
      },
    });
    res.json({ url: session.url });
  } catch (e: any) {
    console.error("Checkout creation failed:", e);
    res.status(500).json({ error: e?.message ?? "Checkout failed" });
  }
});

// Open the Stripe Customer Portal for the operator to manage their
// subscription, payment method, invoice history, and cancellation.
app.post("/api/billing/portal", authenticateUser, async (req: any, res: any) => {
  try {
    if (!stripeAvailable()) return res.status(503).json({ error: "Stripe not configured." });
    const { data: sub } = await db.from("wireline_subscriptions")
      .select("stripe_customer_id").eq("user_id", req.user.id).maybeSingle();
    if (!sub?.stripe_customer_id) {
      return res.status(404).json({ error: "No Stripe customer for this user yet — run checkout first." });
    }
    const base = billingBaseUrl(req);
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${base}/admin`,
    });
    res.json({ url: portal.url });
  } catch (e: any) {
    console.error("Portal session failed:", e);
    res.status(500).json({ error: e?.message ?? "Portal failed" });
  }
});

// ──────────────────────────────────────────────────────────
//  CSV EXPORT — operators get their data out for compliance, analysis,
//  or migration. RFC 4180 quoting; streamed via res.send().
// ──────────────────────────────────────────────────────────

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Quote if contains delimiter, quote, or newline; escape inner quotes by doubling.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows: any[], columns: string[]): string {
  const header = columns.map(csvEscape).join(",");
  if (!rows.length) return header + "\n";
  const body = rows.map(r => columns.map(c => csvEscape(r[c])).join(",")).join("\n");
  return header + "\n" + body + "\n";
}

const EXPORT_DEFS: Record<string, { table: string; columns: string[]; order: string }> = {
  calls: {
    table: "wireline_call_logs",
    columns: ["id", "vapi_call_id", "agent_id", "direction", "customer_number", "duration_seconds", "cost", "lead_score", "intent_label", "summary", "transcript", "recording_url", "created_at"],
    order: "created_at",
  },
  leads: {
    table: "wireline_outbound_leads",
    columns: ["id", "agent_id", "phone_number", "customer_number", "customer_name", "context", "status", "call_id", "last_called_at", "created_at"],
    order: "created_at",
  },
  appointments: {
    table: "wireline_appointments",
    columns: ["id", "agent_id", "call_id", "date", "time", "customer_name", "service_type", "status", "created_at"],
    order: "created_at",
  },
  tasks: {
    table: "wireline_fleet_tasks",
    columns: ["id", "task_type", "description", "status", "priority", "target_channel", "agent_id", "source_type", "source_id", "due_date", "resolution_notes", "created_at"],
    order: "created_at",
  },
};

app.get("/api/export/:type.csv", authenticateUser, async (req: any, res: any) => {
  try {
    const def = EXPORT_DEFS[req.params.type];
    if (!def) return res.status(404).json({ error: `Unknown export type. Use: ${Object.keys(EXPORT_DEFS).join(", ")}.` });

    const { data, error } = await db
      .from(def.table)
      .select(def.columns.join(","))
      .eq("user_id", req.user.id)
      .order(def.order, { ascending: false });
    if (error) throw error;

    const filename = `wireline-${req.params.type}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(rowsToCsv(data || [], def.columns));
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Export failed" });
  }
});

// ──────────────────────────────────────────────────────────
//  CLAUDE BRAIN — additional capability-elevating endpoints
// ──────────────────────────────────────────────────────────

// Manual re-run of the post-call analysis on an existing call.
// Useful when ANTHROPIC_API_KEY was added after some calls were already logged.
app.post("/api/claude/post-call/:callId", authenticateUser, async (req: any, res: any) => {
  try {
    const { data: call } = await db
      .from("wireline_call_logs")
      .select("*, agent_id, user_id")
      .eq("id", req.params.callId)
      .eq("user_id", req.user.id)
      .single();
    if (!call) return res.status(404).json({ error: "Call not found." });
    const { data: agent } = await db
      .from("wireline_agents")
      .select("name, archetype, role")
      .eq("id", call.agent_id)
      .single();

    const result = await claudeBrain.postCallAnalysis({
      agentName: agent?.name || "Wireline Agent",
      archetype: agent?.archetype || "Receptionist",
      role: agent?.role || undefined,
      customerNumber: call.customer_number,
      durationSeconds: call.duration_seconds,
      summary: call.summary || "",
      transcript: call.transcript || "",
    });

    await db.from("wireline_call_logs").update({
      lead_score: result.lead_score,
      intent_label: result.intent_label,
    }).eq("id", call.id);

    res.json({ analysis: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Live call coach — given a transcript or a callId, returns coaching.
app.post("/api/claude/coach", authenticateUser, async (req: any, res: any) => {
  try {
    const { transcript: rawTranscript, callId, agentId, isLive } = req.body;
    let transcript = rawTranscript as string | undefined;
    let agentName = "Wireline Agent";
    let archetype = "Receptionist";
    let role: string | undefined;

    if (callId) {
      const { data: call } = await db.from("wireline_call_logs")
        .select("transcript, agent_id")
        .eq("id", callId).eq("user_id", req.user.id).single();
      if (call) {
        transcript = transcript || call.transcript;
        const { data: a } = await db.from("wireline_agents")
          .select("name, archetype, role").eq("id", call.agent_id).single();
        if (a) { agentName = a.name; archetype = a.archetype; role = a.role || undefined; }
      }
    } else if (agentId) {
      const { data: a } = await db.from("wireline_agents")
        .select("name, archetype, role").eq("id", agentId).eq("user_id", req.user.id).single();
      if (a) { agentName = a.name; archetype = a.archetype; role = a.role || undefined; }
    }

    if (!transcript) return res.status(400).json({ error: "Provide a transcript or callId." });

    const result = await claudeBrain.coach({ agentName, archetype, role, transcript, isLive: !!isLive });
    res.json({ coaching: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Knowledge ingestion from URL — Claude fetches and extracts.
// Optional `maxPages > 1` upgrades the request from a single-page fetch
// to a same-domain crawl following nav links, capped at 25 pages.
app.post("/api/claude/knowledge-from-url", authenticateUser, async (req: any, res: any) => {
  try {
    const { url, agentContext, maxEntries, maxPages } = req.body;
    if (!url || typeof url !== "string") return res.status(400).json({ error: "url required." });
    try { new URL(url); } catch { return res.status(400).json({ error: "url is not a valid URL." }); }
    const result = await claudeBrain.knowledgeFromUrl({ url, agentContext, maxEntries, maxPages });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Knowledge ingestion from a PDF document (Claude native PDF support).
app.post("/api/claude/knowledge-from-document", authenticateUser, async (req: any, res: any) => {
  try {
    const { pdfBase64, fileName, agentContext, maxEntries } = req.body;
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return res.status(400).json({ error: "pdfBase64 required (base64-encoded PDF, no data: prefix)." });
    }
    // Quick sanity check: PDF starts with %PDF-
    let head = "";
    try { head = Buffer.from(pdfBase64.slice(0, 16), "base64").toString("utf8", 0, 5); } catch {}
    if (!head.startsWith("%PDF")) {
      return res.status(400).json({ error: "File does not look like a valid PDF." });
    }
    const result = await claudeBrain.knowledgeFromDocument({ pdfBase64, fileName, agentContext, maxEntries });
    res.json(result);
  } catch (e) {
    claudeErr(res, e);
  }
});

// Apply a set of extracted knowledge entries to an agent.
app.post("/api/claude/knowledge-from-url/apply", authenticateUser, async (req: any, res: any) => {
  try {
    const { agentId, entries } = req.body;
    if (!agentId || !Array.isArray(entries)) {
      return res.status(400).json({ error: "agentId and entries[] required." });
    }
    const { data: agent } = await db.from("wireline_agents")
      .select("id").eq("id", agentId).eq("user_id", req.user.id).single();
    if (!agent) return res.status(404).json({ error: "Agent not found." });

    const rows = entries
      .filter((e: any) => typeof e?.fact === "string" && e.fact.trim())
      .map((e: any) => ({
        agent_id: agentId,
        user_id: req.user.id,
        content: e.fact.trim(),
      }));
    if (rows.length === 0) return res.status(400).json({ error: "No valid entries to insert." });
    await db.from("wireline_knowledge").insert(rows);
    res.json({ inserted: rows.length });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Knowledge dedupe — Claude pass over the operator's whole knowledge
// base to find duplicate / near-duplicate / contradictory facts.
// Auto-instrumented via the existing /api/claude/* withAudit chain,
// so the cost shows up in the AI-Spend dashboard automatically.
//
// Returns {clusters} with input ids verbatim. The UI applies operator
// decisions via the existing PATCH/DELETE /api/knowledge/:id endpoints.
const KNOWLEDGE_DEDUPE_MAX_FACTS = 400;
app.post("/api/claude/knowledge-dedupe", authenticateUser, async (req: any, res: any) => {
  try {
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for knowledge dedupe.", code: "CLAUDE_OFFLINE" });
    }
    const [{ data: rows }, { data: agents }] = await Promise.all([
      db.from("wireline_knowledge").select("id, agent_id, content").eq("user_id", req.user.id).limit(KNOWLEDGE_DEDUPE_MAX_FACTS),
      db.from("wireline_agents").select("id, name").eq("user_id", req.user.id),
    ]);
    if (!rows || rows.length < 2) {
      return res.json({ clusters: [], total_analyzed: rows?.length || 0, message: "Not enough facts to dedupe." });
    }
    const agentMap = new Map((agents || []).map((a: any) => [a.id, a.name]));
    const result = await claudeBrain.findKnowledgeDuplicates({
      facts: rows.map((r: any) => ({
        id: r.id,
        agent_name: agentMap.get(r.agent_id) || "(unknown)",
        content: r.content,
      })),
    });
    // Defensive: drop any cluster that references an id we didn't send,
    // or that doesn't have ≥ 2 valid members. Claude's tool schema
    // already enforces this but better-safe-than-sorry.
    const validIds = new Set(rows.map((r: any) => r.id));
    const safe = (result.clusters || [])
      .map((c: any) => ({
        ...c,
        members: (c.members || []).filter((m: any) => validIds.has(m.id)),
      }))
      .filter((c: any) =>
        c.members.length >= 2 &&
        validIds.has(c.recommended_keep_id) &&
        c.members.some((m: any) => m.id === c.recommended_keep_id),
      );
    res.json({
      clusters: safe,
      total_analyzed: result.total_analyzed ?? rows.length,
      truncated: rows.length === KNOWLEDGE_DEDUPE_MAX_FACTS,
    });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Lead enrichment — pre-call web research. Auto-instrumented via the
// /api/claude/* withAudit chain so the cost lands in AI Spend, and the
// hard-cap gate refuses the request if the operator is over budget.
app.post("/api/claude/enrich-lead", authenticateUser, async (req: any, res: any) => {
  try {
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for lead enrichment.", code: "CLAUDE_OFFLINE" });
    }
    const customer_number = (req.body?.customer_number || req.body?.phone || "").toString().trim();
    if (!customer_number) {
      return res.status(400).json({ error: "customer_number is required." });
    }
    const enrichment = await claudeBrain.enrichLead({
      customer_number,
      customer_name: (req.body?.customer_name || req.body?.name || "").toString().slice(0, 200) || null,
      context: (req.body?.context || "").toString().slice(0, 4000) || null,
      industry_hint: (req.body?.industry_hint || "").toString().slice(0, 200) || null,
    });
    res.json({ enrichment });
  } catch (e) {
    claudeErr(res, e);
  }
});

// Agent Forge — synthesize a complete agent draft from a goal.
app.post("/api/claude/forge", authenticateUser, async (req: any, res: any) => {
  try {
    const { goal, industry, companyName, websiteUrl, voicePreference } = req.body;
    if (!goal) return res.status(400).json({ error: "goal required." });
    const result = await claudeBrain.forgeAgent({ goal, industry, companyName, websiteUrl, voicePreference });
    res.json({ design: result });
  } catch (e) {
    claudeErr(res, e);
  }
});

// ──────────────────────────────────────────────────────────
//  INSIGHTS — business intelligence the operator actually needs
// ──────────────────────────────────────────────────────────

// Tiny in-memory cache for the Claude-powered insights. Keyed by
// (user_id, endpoint). 1-hour TTL is plenty — the underlying data
// only changes when calls land, which is sub-daily for most SMBs.
const insightCache = new Map<string, { ts: number; data: any }>();
const INSIGHT_TTL_MS = 60 * 60 * 1000;
function cachedInsight(key: string) {
  const entry = insightCache.get(key);
  return entry && Date.now() - entry.ts < INSIGHT_TTL_MS ? entry.data : null;
}
function setCachedInsight(key: string, data: any) {
  insightCache.set(key, { ts: Date.now(), data });
}

// Conversion funnel — calls → connected → qualified → booked → completed.
app.get("/api/insights/funnel", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: calls }, { data: appts }, { data: leads }] = await Promise.all([
      db.from("wireline_call_logs").select("lead_score, intent_label, duration_seconds").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_appointments").select("status").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_outbound_leads").select("status").eq("user_id", req.user.id).gte("created_at", since),
    ]);

    const totalCalls = calls?.length || 0;
    const connected = (calls || []).filter((c: any) => (c.duration_seconds || 0) > 10).length;
    const qualified = (calls || []).filter((c: any) => (c.lead_score || 0) >= 50).length;
    const highIntent = (calls || []).filter((c: any) => c.intent_label === "high").length;
    const bookings = (appts || []).length;
    const completed = (appts || []).filter((a: any) => a.status === "Completed").length;
    const queuedLeads = (leads || []).filter((l: any) => l.status === "Pending" || l.status === "Queued").length;

    res.json({
      window_days: days,
      stages: [
        { name: "Queued",     count: queuedLeads },
        { name: "Calls",      count: totalCalls },
        { name: "Connected",  count: connected },
        { name: "Qualified",  count: qualified },
        { name: "High intent", count: highIntent },
        { name: "Booked",     count: bookings },
        { name: "Completed",  count: completed },
      ],
    });
  } catch (e) { claudeErr(res, e); }
});

// Hour-of-day × day-of-week heatmap of call volume + lead score.
app.get("/api/insights/heatmap", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data: calls } = await db
      .from("wireline_call_logs")
      .select("created_at, lead_score")
      .eq("user_id", req.user.id)
      .gte("created_at", since);

    // 7×24 grid: counts and avg lead score
    const grid: { hour: number; weekday: number; count: number; avg_score: number }[] = [];
    const buckets: Record<string, { c: number; s: number }> = {};
    for (const c of calls || []) {
      const d = new Date(c.created_at);
      const key = `${d.getDay()}-${d.getHours()}`;
      const b = buckets[key] || { c: 0, s: 0 };
      b.c++;
      b.s += c.lead_score || 0;
      buckets[key] = b;
    }
    for (let w = 0; w < 7; w++) {
      for (let h = 0; h < 24; h++) {
        const b = buckets[`${w}-${h}`] || { c: 0, s: 0 };
        grid.push({ weekday: w, hour: h, count: b.c, avg_score: b.c ? Math.round(b.s / b.c) : 0 });
      }
    }
    res.json({ window_days: days, grid });
  } catch (e) { claudeErr(res, e); }
});

// Per-agent leaderboard.
app.get("/api/insights/leaderboard", authenticateUser, async (req: any, res: any) => {
  try {
    const days = Math.min(parseInt((req.query.days as string) || "30"), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: agents }, { data: calls }, { data: appts }] = await Promise.all([
      db.from("wireline_agents").select("id, name, archetype, channel, role").eq("user_id", req.user.id),
      db.from("wireline_call_logs").select("agent_id, lead_score, intent_label, duration_seconds, cost").eq("user_id", req.user.id).gte("created_at", since),
      db.from("wireline_appointments").select("agent_id").eq("user_id", req.user.id).gte("created_at", since),
    ]);

    const callsByAgent: Record<string, any[]> = {};
    for (const c of calls || []) {
      const id = c.agent_id || "unknown";
      (callsByAgent[id] ||= []).push(c);
    }
    const apptsByAgent: Record<string, number> = {};
    for (const a of appts || []) apptsByAgent[a.agent_id || "unknown"] = (apptsByAgent[a.agent_id || "unknown"] || 0) + 1;

    const rows = (agents || []).map((a: any) => {
      const calls = callsByAgent[a.id] || [];
      const total = calls.length;
      const qualified = calls.filter((c) => (c.lead_score || 0) >= 50).length;
      const highIntent = calls.filter((c) => c.intent_label === "high").length;
      const minutes = Math.round(calls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / 60);
      const cost = Number(calls.reduce((s, c) => s + Number(c.cost || 0), 0).toFixed(2));
      const avgScore = total ? Math.round(calls.reduce((s, c) => s + (c.lead_score || 0), 0) / total) : 0;
      const bookings = apptsByAgent[a.id] || 0;
      const costPerQualified = qualified ? Number((cost / qualified).toFixed(2)) : 0;
      return {
        agent_id: a.id,
        agent_name: a.name,
        archetype: a.archetype,
        role: a.role || DEFAULT_AGENT_ROLE,
        channel: a.channel,
        total_calls: total,
        qualified,
        high_intent: highIntent,
        bookings,
        avg_lead_score: avgScore,
        minutes,
        cost,
        cost_per_qualified: costPerQualified,
        conversion_rate: total ? Math.round((qualified / total) * 100) : 0,
      };
    }).sort((a: any, b: any) => b.qualified - a.qualified);

    res.json({ window_days: days, agents: rows });
  } catch (e) { claudeErr(res, e); }
});

// Topic clusters (Claude-powered, cached 1h per user).
app.get("/api/insights/topics", authenticateUser, async (req: any, res: any) => {
  try {
    const force = req.query.refresh === "1";
    const cacheKey = `topics:${req.user.id}`;
    if (!force) {
      const cached = cachedInsight(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for topic clustering.", code: "CLAUDE_OFFLINE" });
    }
    const { data: rows } = await db
      .from("wireline_call_logs")
      .select("summary, intent_label")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(120);
    if (!rows || rows.length < 3) {
      return res.json({ topics: [], total_analyzed: rows?.length || 0, message: "Not enough data yet — run more calls." });
    }
    const result = await claudeBrain.clusterTopics({
      summaries: rows.map((r: any) => ({ summary: r.summary || "", intent_label: r.intent_label })),
      windowDays: 14,
    });
    setCachedInsight(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (e) { claudeErr(res, e); }
});

// Failure modes (Claude-powered, cached 1h per user).
app.get("/api/insights/failure-modes", authenticateUser, async (req: any, res: any) => {
  try {
    const force = req.query.refresh === "1";
    const cacheKey = `failures:${req.user.id}`;
    if (!force) {
      const cached = cachedInsight(cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }
    if (!claudeBrain.isClaudeAvailable()) {
      return res.status(503).json({ error: "Claude required for failure analysis.", code: "CLAUDE_OFFLINE" });
    }
    const { data: rows } = await db
      .from("wireline_call_logs")
      .select("summary, transcript, lead_score, intent_label")
      .eq("user_id", req.user.id)
      .or("lead_score.lt.30,intent_label.eq.low,intent_label.eq.none")
      .order("created_at", { ascending: false })
      .limit(20);
    if (!rows || rows.length < 2) {
      return res.json({ modes: [], message: "Not enough failed calls yet — system is performing well." });
    }
    const result = await claudeBrain.clusterFailureModes({ failedCalls: rows as any });
    setCachedInsight(cacheKey, result);
    res.json({ ...result, cached: false });
  } catch (e) { claudeErr(res, e); }
});

// Daily brief (Claude-powered, cached per-day).
// Shared between the HTTP endpoint and the scheduled email sender.
// Honors the same per-day cache so a manual /api/insights/daily-brief
// fetch and the morning email don't both pay Claude.
async function computeDailyBrief(userId: string, opts?: { force?: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `brief:${userId}:${today}`;
  if (!opts?.force) {
    const cached = cachedInsight(cacheKey);
    if (cached) return { payload: cached, cached: true };
  }
  if (!claudeBrain.isClaudeAvailable()) {
    const err: any = new Error("Claude required for the daily brief.");
    err.code = "CLAUDE_OFFLINE";
    throw err;
  }

  const yStart = new Date(); yStart.setHours(0, 0, 0, 0); yStart.setDate(yStart.getDate() - 1);
  const yEnd   = new Date(yStart); yEnd.setDate(yEnd.getDate() + 1);
  const wStart = new Date(); wStart.setDate(wStart.getDate() - 7);

  const [{ data: yCalls }, { data: wCalls }, { data: appts }, { data: tasks }, { data: leads }, { data: wins }, { data: losses }] = await Promise.all([
    db.from("wireline_call_logs").select("lead_score, intent_label, duration_seconds, cost, summary, customer_number").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString()),
    db.from("wireline_call_logs").select("lead_score, duration_seconds, cost").eq("user_id", userId).gte("created_at", wStart.toISOString()),
    db.from("wireline_appointments").select("id").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("created_at", yEnd.toISOString()),
    db.from("wireline_fleet_tasks").select("priority, description").eq("user_id", userId).eq("status", "pending").order("created_at", { ascending: false }).limit(8),
    db.from("wireline_outbound_leads").select("id").eq("user_id", userId).eq("status", "Pending"),
    db.from("wireline_call_logs").select("customer_number, lead_score, summary").eq("user_id", userId).gte("created_at", yStart.toISOString()).gte("lead_score", 70).order("lead_score", { ascending: false }).limit(3),
    db.from("wireline_call_logs").select("customer_number, lead_score, summary").eq("user_id", userId).gte("created_at", yStart.toISOString()).lt("lead_score", 30).order("created_at", { ascending: false }).limit(3),
  ]);

  const yTotal = yCalls?.length || 0;
  const yMinutes = Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 60);
  const yAvgScore = yTotal ? Math.round((yCalls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / yTotal) : 0;
  const yHighIntent = (yCalls || []).filter((c: any) => c.intent_label === "high").length;
  const yCost = Number((yCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0).toFixed(2));

  const wDays = 7;
  const wAvgPerDay = (wCalls?.length || 0) / wDays;
  const wAvgScore = wCalls?.length ? (wCalls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / wCalls.length : 0;
  const wAvgCostPerDay = (wCalls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0) / wDays;

  const callsPct = wAvgPerDay > 0 ? ((yTotal - wAvgPerDay) / wAvgPerDay) * 100 : 0;
  const scorePct = wAvgScore > 0 ? ((yAvgScore - wAvgScore) / wAvgScore) * 100 : 0;
  const costPct = wAvgCostPerDay > 0 ? ((yCost - wAvgCostPerDay) / wAvgCostPerDay) * 100 : 0;

  const result = await claudeBrain.dailyBrief({
    yesterdayStats: {
      total_calls: yTotal,
      total_minutes: yMinutes,
      avg_lead_score: yAvgScore,
      high_intent_count: yHighIntent,
      cost: yCost,
      appointments_booked: appts?.length || 0,
      pending_tasks: tasks?.length || 0,
      new_leads: leads?.length || 0,
    },
    weekDelta: { calls_pct: callsPct, score_pct: scorePct, cost_pct: costPct },
    recentWinSamples: (wins || []).map((w: any) => ({ customer: w.customer_number || "Unknown", score: w.lead_score || 0, summary: w.summary || "" })),
    recentLossSamples: (losses || []).map((w: any) => ({ customer: w.customer_number || "Unknown", score: w.lead_score || 0, summary: w.summary || "" })),
    openTasks: (tasks || []).map((t: any) => ({ priority: t.priority, description: t.description })),
  });

  const payload = {
    brief: result,
    stats_yesterday: {
      total_calls: yTotal,
      total_minutes: yMinutes,
      avg_lead_score: yAvgScore,
      high_intent_count: yHighIntent,
      cost: yCost,
      appointments_booked: appts?.length || 0,
    },
    week_delta: { calls_pct: callsPct, score_pct: scorePct, cost_pct: costPct },
  };
  setCachedInsight(cacheKey, payload);
  return { payload, cached: false };
}

app.get("/api/insights/daily-brief", authenticateUser, async (req: any, res: any) => {
  try {
    const { payload, cached } = await computeDailyBrief(req.user.id, { force: req.query.refresh === "1" });
    res.json({ ...payload, cached });
  } catch (e: any) {
    if (e?.code === "CLAUDE_OFFLINE") return res.status(503).json({ error: e.message, code: e.code });
    claudeErr(res, e);
  }
});

// ──────────────────────────────────────────────────────────
//  TRIAGE INBOX — "what needs my attention right now"
// ──────────────────────────────────────────────────────────

app.get("/api/triage", authenticateUser, async (req: any, res: any) => {
  try {
    const [{ data: hotLeads }, { data: complianceTasks }, { data: pendingTasks }, { data: knowledgeGaps }, { data: escalations }] = await Promise.all([
      // Calls with high lead score from the last 7 days that don't have a follow-up logged.
      db.from("wireline_call_logs")
        .select("id, agent_id, customer_number, lead_score, intent_label, summary, created_at")
        .eq("user_id", req.user.id)
        .gte("lead_score", 70)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("lead_score", { ascending: false })
        .limit(30),
      db.from("wireline_fleet_tasks")
        .select("*")
        .eq("user_id", req.user.id)
        .eq("task_type", "compliance_review")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(20),
      db.from("wireline_fleet_tasks")
        .select("*")
        .eq("user_id", req.user.id)
        .eq("status", "pending")
        .neq("task_type", "compliance_review")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("wireline_agent_lessons")
        .select("id, agent_id, lesson, created_at")
        .eq("user_id", req.user.id)
        .like("lesson", "[KNOWLEDGE GAP]%")
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("wireline_call_logs")
        .select("id, agent_id, customer_number, lead_score, summary, created_at")
        .eq("user_id", req.user.id)
        .or("intent_label.eq.escalation")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    res.json({
      hot_leads: hotLeads || [],
      compliance: complianceTasks || [],
      pending_tasks: pendingTasks || [],
      knowledge_gaps: knowledgeGaps || [],
      escalations: escalations || [],
      counts: {
        hot_leads: hotLeads?.length || 0,
        compliance: complianceTasks?.length || 0,
        pending_tasks: pendingTasks?.length || 0,
        knowledge_gaps: knowledgeGaps?.length || 0,
        escalations: escalations?.length || 0,
      },
    });
  } catch (e) { claudeErr(res, e); }
});

// Promote a [KNOWLEDGE GAP] lesson into the agent's knowledge base.
app.post("/api/knowledge-gaps/:lessonId/promote", authenticateUser, async (req: any, res: any) => {
  try {
    const { customContent } = req.body;
    const { data: lesson } = await db
      .from("wireline_agent_lessons")
      .select("id, agent_id, lesson, user_id")
      .eq("id", req.params.lessonId)
      .eq("user_id", req.user.id)
      .single();
    if (!lesson) return res.status(404).json({ error: "Lesson not found." });

    const content =
      customContent?.trim() ||
      lesson.lesson.replace(/^\[KNOWLEDGE GAP\]\s*/, "").trim();

    if (!content) return res.status(400).json({ error: "Content is empty." });

    await db.from("wireline_knowledge").insert({
      agent_id: lesson.agent_id,
      user_id: req.user.id,
      content,
    });
    await db.from("wireline_agent_lessons").delete().eq("id", lesson.id);
    res.json({ success: true });
  } catch (e) { claudeErr(res, e); }
});

// ──────────────────────────────────────────────────────────
//  CONTACT PROFILE — unified per-customer history
// ──────────────────────────────────────────────────────────

app.get("/api/contacts/:number", authenticateUser, async (req: any, res: any) => {
  try {
    const number = decodeURIComponent(req.params.number);
    // Strip non-digits then take the last 10 — gives us a normalized form.
    const norm = number.replace(/\D/g, "").slice(-10);
    if (!norm) return res.status(400).json({ error: "Invalid phone number." });

    // Match: exact, or anything ending in the same last-10-digits.
    const [{ data: calls }, { data: leads }, { data: appts }] = await Promise.all([
      db.from("wireline_call_logs")
        .select("id, agent_id, direction, customer_number, duration_seconds, cost, summary, transcript, recording_url, lead_score, intent_label, created_at")
        .eq("user_id", req.user.id)
        .ilike("customer_number", `%${norm}`)
        .order("created_at", { ascending: false }),
      db.from("wireline_outbound_leads")
        .select("id, agent_id, customer_name, status, context, last_called_at, created_at, phone_number")
        .eq("user_id", req.user.id)
        .ilike("phone_number", `%${norm}`)
        .order("created_at", { ascending: false }),
      db.from("wireline_appointments")
        .select("id, agent_id, customer_name, service_type, date, time, status, created_at")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false }),
    ]);

    // The first lead/call gives us a candidate name.
    const customerName =
      leads?.[0]?.customer_name ||
      appts?.[0]?.customer_name ||
      null;

    // Build a unified timeline.
    const timeline: any[] = [];
    for (const c of calls || []) {
      timeline.push({
        type: c.direction === "inbound" ? "call_in" : "call_out",
        id: c.id,
        ts: c.created_at,
        duration_seconds: c.duration_seconds,
        cost: c.cost,
        summary: c.summary,
        lead_score: c.lead_score,
        intent_label: c.intent_label,
        recording_url: c.recording_url,
        agent_id: c.agent_id,
      });
    }
    for (const a of appts || []) {
      // Only include appointments where the customer name matches one of our leads/calls
      if (customerName && a.customer_name && a.customer_name.toLowerCase().trim() === customerName.toLowerCase().trim()) {
        timeline.push({
          type: "appointment",
          id: a.id,
          ts: a.created_at,
          summary: `${a.service_type} — ${a.date} ${a.time}`,
          status: a.status,
          agent_id: a.agent_id,
        });
      }
    }
    timeline.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

    const totalCalls = calls?.length || 0;
    const totalMinutes = Math.round((calls || []).reduce((s: number, c: any) => s + (c.duration_seconds || 0), 0) / 60);
    const totalCost = Number((calls || []).reduce((s: number, c: any) => s + Number(c.cost || 0), 0).toFixed(2));
    const avgScore = totalCalls ? Math.round((calls || []).reduce((s: number, c: any) => s + (c.lead_score || 0), 0) / totalCalls) : 0;
    const lastTouch = calls?.[0]?.created_at || leads?.[0]?.created_at || null;

    res.json({
      number: number,
      normalized: norm,
      customer_name: customerName,
      stats: {
        total_calls: totalCalls,
        total_minutes: totalMinutes,
        total_cost: totalCost,
        avg_lead_score: avgScore,
        last_touch: lastTouch,
        outbound_leads: leads?.length || 0,
        appointments: appts?.filter((a: any) => customerName && a.customer_name?.toLowerCase().trim() === customerName.toLowerCase().trim()).length || 0,
      },
      timeline,
      leads: leads || [],
      appointments: (appts || []).filter((a: any) => customerName && a.customer_name?.toLowerCase().trim() === customerName.toLowerCase().trim()),
    });
  } catch (e) { claudeErr(res, e); }
});

// Agent Forge — create the actual agent + seed personality, directives, knowledge.
app.post("/api/claude/forge/create", authenticateUser, async (req: any, res: any) => {
  try {
    const { design, websiteUrl } = req.body;
    if (!design || !design.name) return res.status(400).json({ error: "design with name required." });

    const agentId = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const { error: agentErr } = await db.from("wireline_agents").insert({
      id: agentId,
      user_id: req.user.id,
      name: design.name,
      archetype: design.archetype || "Receptionist",
      first_message: design.first_message || `Hi, this is ${design.name}. How can I help?`,
      website_url: websiteUrl || null,
      channel: "voice",
    });
    if (agentErr) throw agentErr;

    if (design.personality_block) {
      await db.from("wireline_personality").upsert({
        agent_id: agentId,
        user_id: req.user.id,
        content: design.personality_block,
      });
    }

    const directiveRows = (design.directives || []).map((d: any) => ({
      agent_id: agentId,
      user_id: req.user.id,
      content: d.content,
      priority: d.priority ?? 5,
    }));
    if (directiveRows.length) await db.from("wireline_directives").insert(directiveRows);

    const knowledgeRows = (design.seed_knowledge || []).map((k: string) => ({
      agent_id: agentId,
      user_id: req.user.id,
      content: k,
    }));
    if (knowledgeRows.length) await db.from("wireline_knowledge").insert(knowledgeRows);

    res.json({ success: true, agentId });
  } catch (e) {
    claudeErr(res, e);
  }
});

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error("Unhandled global error", {
    requestId: (res as any).locals?.requestId,
    method: req.method,
    path: req.path,
    error: err?.message || String(err),
    stack: err?.stack,
  });
  res.status(500).json({ error: 'Internal Server Error', requestId: (res as any).locals?.requestId });
});

// ==========================================
// 3. VITE MIDDLEWARE & STATIC SERVING
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    log.info(`Server running on http://localhost:${PORT}`);
  });

  // ────────────────────────────────────────────────────────────────
  //  Graceful shutdown — stop accepting new connections, drain
  //  in-flight requests for up to GRACE_MS, then exit. Triggered by
  //  SIGTERM (Vercel/PM2/systemd) and SIGINT (Ctrl-C).
  // ────────────────────────────────────────────────────────────────
  const GRACE_MS = 15_000;
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`Received ${signal} — starting graceful shutdown`);
    const forceTimer = setTimeout(() => {
      log.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, GRACE_MS).unref?.();
    server.close((err) => {
      clearTimeout(forceTimer as any);
      if (err) {
        log.error("Error during server.close", { error: err.message });
        process.exit(1);
      }
      log.info("Graceful shutdown complete");
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ────────────────────────────────────────────────────────────────────
//  Process-level safety net — never let an unhandled rejection or
//  uncaught exception silently crash the worker. We log structured
//  details and (for uncaught exceptions, which leave the process in
//  an unknown state) ask the runtime to restart us.
// ────────────────────────────────────────────────────────────────────
process.on("unhandledRejection", (reason: any) => {
  log.error("unhandledRejection", {
    error: reason?.message || String(reason),
    stack: reason?.stack,
  });
});
process.on("uncaughtException", (err: Error) => {
  log.error("uncaughtException", { error: err.message, stack: err.stack });
  // Best practice: process is in an unknown state — exit so the
  // platform's restart policy boots us fresh. Skipped on Vercel where
  // each invocation is its own process.
  if (process.env.VERCEL !== "1") {
    setTimeout(() => process.exit(1), 100).unref?.();
  }
});

export { app };

// Only start the HTTP server when running standalone (not on Vercel).
// Vercel sets VERCEL=1 automatically in all serverless function environments.
if (process.env.VERCEL !== '1') {
  startServer();
}
