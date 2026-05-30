/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import express, { Request, Response, NextFunction } from "express";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { getErrorMessage } from "../lib/server-utils";
import { getHealthCapabilities, getIntegrationsStatus } from "../lib/integrations-registry";
import { authenticateUser } from "../middleware/auth";
import { getOperatorSloSnapshot } from "../lib/operator-slos";
import {
  CLAUDE_MODEL_DEFAULT,
  VAPI_PREMIUM_MODEL,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_VOICE_FALLBACK_MODEL,
  CLAUDE_MODELS,
  GEMINI_MODELS,
} from "../lib/claude-brain";
import { getClient as getAnthropicClient, isClaudeAvailable } from "../lib/claude-client";
import type { AuthenticatedRequest } from "../types/auth";

const router = express.Router();

async function probeDatabase(
  timeoutMs = 1500,
): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const t0 = Date.now();
  try {
    const probe = drizzle.select({ id: schema.settings.userId }).from(schema.settings).limit(1);

    await Promise.race([
      probe,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("db probe timed out")), timeoutMs),
      ),
    ]);
    return { ok: true, latency_ms: Date.now() - t0 };
  } catch (err: any) {
    return { ok: false, latency_ms: Date.now() - t0, error: getErrorMessage(err) };
  }
}

const healthRateLimit = new Map<string, number[]>();
const HEALTH_RATE_WINDOW_MS = 60_000;
const HEALTH_RATE_MAX = 30;
// Purge stale IP entries every 10 minutes to prevent unbounded Map growth
// in long-running (Docker) deployments. Skip when the Map is small to avoid
// unnecessary iteration overhead.
(
  setInterval(
    () => {
      if (healthRateLimit.size < 100) return;
      const now = Date.now();
      for (const [key, hits] of healthRateLimit) {
        if (hits.every((t) => now - t >= HEALTH_RATE_WINDOW_MS)) {
          healthRateLimit.delete(key);
        }
      }
    },
    10 * 60 * 1000,
  ) as any
).unref?.();

function healthRateLimiter(req: Request, res: Response, next: NextFunction) {
  const xff = req.headers["x-forwarded-for"];
  const key = (typeof xff === "string" ? xff.split(",")[0].trim() : null) || req.ip || "anon";
  const now = Date.now();
  const hits = (healthRateLimit.get(key) || []).filter(
    (t: number) => now - t < HEALTH_RATE_WINDOW_MS,
  );
  if (hits.length >= HEALTH_RATE_MAX) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ error: "Too many health-check requests." });
  }
  hits.push(now);
  healthRateLimit.set(key, hits);
  next();
}

/**
 * Public health probe — INTENTIONALLY MINIMAL. Returns enough for load
 * balancers + uptime monitors to know we're alive, but no information
 * disclosure (no capability matrix, no model names, no vendor names, no
 * db latency, no uptime). Full detail moved to /api/health/internal,
 * which is authenticated.
 *
 * A "too talkative" health endpoint is a free reconnaissance gift to
 * attackers and reads as amateur on a security-conscious prospect's
 * first probe.
 */
router.get("/", healthRateLimiter, async (_req: Request, res: Response) => {
  const dbStatus = await probeDatabase();
  res.status(dbStatus.ok ? 200 : 503).json({
    ok: dbStatus.ok,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Authenticated detail probe — same data the old public probe returned,
 * now gated behind a valid JWT. Used by the in-app SystemPanel + the
 * monitoring stack (which signs in as a service account).
 */
router.get(
  "/internal",
  healthRateLimiter,
  authenticateUser,
  async (_req: Request, res: Response) => {
    const dbStatus = await probeDatabase();
    const status = dbStatus.ok ? "ok" : "degraded";
    res.status(200).json({
      status,
      uptime_s: Math.round((process as any).uptime?.() || 0),
      db: dbStatus,
      capabilities: getHealthCapabilities(),
      // Distinct identifiers per runtime so operators + monitoring can
      // see exactly which model each layer is on. The in-app reasoning
      // brain (post-call digest, recipes, QA) leads the voice-agent
      // brain (constrained to whatever Vapi's allowlist accepts), and
      // the 10 showcase agents on the landing page run a higher tier
      // than the tenant default.
      app_model: CLAUDE_MODEL_DEFAULT,
      voice_agent_model: VAPI_TENANT_DEFAULT_MODEL,
      voice_agent_premium_model: VAPI_PREMIUM_MODEL,
      llm_tiering: {
        voice_runtime: {
          provider: "anthropic",
          model: VAPI_TENANT_DEFAULT_MODEL,
          reason:
            "smartest model in voice's latency class (TTFT ~300-500ms); adaptive tone, reliable tool calls, consistent cadence",
        },
        voice_fallback: {
          provider: "google",
          model: VAPI_VOICE_FALLBACK_MODEL,
          reason: "sub-250ms TTFT backup used only on Anthropic outages",
        },
        reasoning_layer: {
          provider: "anthropic",
          model: CLAUDE_MODEL_DEFAULT,
          reason:
            "deepest adaptive reasoning; runs OFF the live wire (briefs, coaching, post-call) so latency is invisible",
        },
        grounded_search: {
          provider: "google",
          model: "gemini-2.5-flash",
          reason: "native googleSearchRetrieval tool with citations",
        },
      },
      timestamp: new Date().toISOString(),
    });
  },
);

/**
 * Authenticated, structured integrations report. Used by the AdminSettings
 * Platform Health panel. Returns one row per registered integration with
 * status, required-ness, env-var presence map, and fallback notes.
 */
router.get("/integrations", healthRateLimiter, authenticateUser, (_req: Request, res: Response) => {
  res.json({
    integrations: getIntegrationsStatus(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Public, sanitized health probe. No auth required. Cached aggressively
 * (60s in-memory) so this can't be used to DoS the upstream Anthropic
 * probe; rate-limited by the same middleware as the other /health/* paths.
 *
 * Returns ONLY:
 *   - overall: "operational" | "degraded" | "outage"
 *   - components: { voice_runtime, voice_fallback, reasoning } each as
 *     "operational" | "degraded" | "outage" — no model names, no
 *     latency numbers, no provider details. Public consumers don't
 *     need to know we run Sonnet vs Opus; they need to know "is the
 *     line up?" and that's all this endpoint says.
 *   - last_checked: ISO timestamp of the cache fill
 *
 * Designed to be consumable by:
 *   - The public /status marketing page on trywireline.com
 *   - External uptime monitors (Better Uptime, Pingdom, etc.)
 *   - The TrustSignals strip's green "system status" pill
 */
let publicHealthCache: {
  body: any;
  expiresAt: number;
} | null = null;
const PUBLIC_HEALTH_TTL_MS = 60_000;

function summarize(
  probe: { ok: boolean; error?: string } | null | undefined,
): "operational" | "degraded" | "outage" | "unknown" {
  if (!probe) return "unknown";
  if (probe.ok) return "operational";
  // Distinguish "configured but failing" (outage) from "not configured"
  // (degraded — we don't have visibility, but service may still work
  // via fallback). Heuristic: missing API key → degraded.
  if (probe.error && /not configured|missing/i.test(probe.error)) {
    return "degraded";
  }
  return "outage";
}

router.get("/public", healthRateLimiter, async (_req: Request, res: Response) => {
  const now = Date.now();
  if (publicHealthCache && publicHealthCache.expiresAt > now) {
    res.setHeader("X-Wireline-Cache", "HIT");
    return res.json(publicHealthCache.body);
  }

  // Run the same Anthropic probes as /models, but discard everything
  // except the ok flag. Voice fallback is reported by env presence only
  // (matches the /models endpoint's behavior).
  const [voice, reasoning] = await Promise.all([
    probeAnthropicModel(VAPI_TENANT_DEFAULT_MODEL).catch((err: any) => ({
      ok: false,
      latency_ms: 0,
      model: "",
      error: err?.message ?? "probe failed",
    })),
    probeAnthropicModel(CLAUDE_MODEL_DEFAULT).catch((err: any) => ({
      ok: false,
      latency_ms: 0,
      model: "",
      error: err?.message ?? "probe failed",
    })),
  ]);

  const components = {
    voice_runtime: summarize(voice),
    voice_fallback: process.env.GEMINI_API_KEY ? "operational" : "degraded",
    reasoning: summarize(reasoning),
  } as const;

  // Overall = worst component. Order: outage > degraded > operational.
  const order: Record<string, number> = { operational: 0, degraded: 1, outage: 2, unknown: 1 };
  const worst = Object.values(components).reduce(
    (acc, s) => (order[s] > order[acc] ? s : acc),
    "operational" as string,
  );
  const overallMap: Record<string, "operational" | "degraded" | "outage"> = {
    operational: "operational",
    degraded: "degraded",
    outage: "outage",
    unknown: "degraded",
  };

  const body = {
    overall: overallMap[worst] ?? "degraded",
    components,
    last_checked: new Date().toISOString(),
    // Don't leak our cache TTL in headers, but DO publish a "next_check_at"
    // hint so external monitors can throttle politely.
    next_check_at: new Date(now + PUBLIC_HEALTH_TTL_MS).toISOString(),
  };
  publicHealthCache = { body, expiresAt: now + PUBLIC_HEALTH_TTL_MS };
  res.setHeader("X-Wireline-Cache", "MISS");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(body);
});

/**
 * Authenticated live-probe of every configured LLM tier. The goal is to
 * catch the silent failure mode where a model id in our constants drifts
 * away from what the provider actually serves (e.g. a versioned alias
 * gets retired). Each probe ships ~5 input tokens and asks for ~1 output
 * token, so total cost is negligible (<$0.001 per call).
 *
 * Returns one row per tier with:
 *   - ok: boolean — did the provider accept the model id and respond?
 *   - latency_ms: round-trip TTFT in milliseconds (best-effort)
 *   - error: provider error string if the probe failed
 *
 * Designed to be called by uptime monitors / canaries. Rate-limited like
 * every other health endpoint.
 *
 * NOTE: We only probe Anthropic here. The Gemini-fallback path uses a
 * separate SDK; adding a Google probe is tracked as a follow-up so this
 * endpoint stays fast (<2 s total) on the happy path.
 */
async function probeAnthropicModel(
  model: string,
  timeoutMs = 8_000,
): Promise<{ ok: boolean; latency_ms: number; error?: string; model: string }> {
  const t0 = Date.now();
  if (!isClaudeAvailable()) {
    return {
      ok: false,
      latency_ms: 0,
      model,
      error: "ANTHROPIC_API_KEY not configured",
    };
  }
  try {
    const client = getAnthropicClient();
    const probe = client.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    await Promise.race([
      probe,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error("model probe timed out")), timeoutMs),
      ),
    ]);
    return { ok: true, latency_ms: Date.now() - t0, model };
  } catch (err: any) {
    return {
      ok: false,
      latency_ms: Date.now() - t0,
      model,
      // Surface only the message — not the full Anthropic error envelope —
      // because the full envelope can include request ids that aren't
      // safe to render on the dashboard.
      error: getErrorMessage(err).slice(0, 240),
    };
  }
}

router.get("/models", healthRateLimiter, authenticateUser, async (_req: Request, res: Response) => {
  const t0 = Date.now();
  const [voice, voicePremium, reasoning] = await Promise.all([
    probeAnthropicModel(VAPI_TENANT_DEFAULT_MODEL),
    // Skip the premium probe when it would duplicate the tenant probe —
    // saves a roundtrip when showcase/tenant are on the same model.
    VAPI_PREMIUM_MODEL !== VAPI_TENANT_DEFAULT_MODEL
      ? probeAnthropicModel(VAPI_PREMIUM_MODEL)
      : Promise.resolve(null),
    probeAnthropicModel(CLAUDE_MODEL_DEFAULT),
  ]);
  const allOk = voice.ok && reasoning.ok && (voicePremium ? voicePremium.ok : true);
  res.status(allOk ? 200 : 503).json({
    ok: allOk,
    total_latency_ms: Date.now() - t0,
    probes: {
      voice_runtime: voice,
      ...(voicePremium ? { voice_premium: voicePremium } : {}),
      reasoning: reasoning,
      // Static info — Google Gemini fallback is not probed live to keep
      // this endpoint snappy; status is "configured" if the env is set.
      voice_fallback: {
        ok: !!process.env.GEMINI_API_KEY,
        latency_ms: 0,
        model: VAPI_VOICE_FALLBACK_MODEL,
        ...(process.env.GEMINI_API_KEY ? {} : { error: "GEMINI_API_KEY not configured" }),
      },
    },
    constants: {
      voice_runtime: VAPI_TENANT_DEFAULT_MODEL,
      voice_premium: VAPI_PREMIUM_MODEL,
      voice_fallback: VAPI_VOICE_FALLBACK_MODEL,
      reasoning_default: CLAUDE_MODEL_DEFAULT,
      sonnet: CLAUDE_MODELS.SONNET,
      opus: CLAUDE_MODELS.OPUS,
      haiku: CLAUDE_MODELS.HAIKU,
      gemini_flash: GEMINI_MODELS.FLASH_3_5,
    },
    timestamp: new Date().toISOString(),
  });
});

/** Authenticated SLO snapshot for the signed-in tenant (Admin → System). */
router.get(
  "/slos",
  healthRateLimiter,
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const n = Number(req.query.window_hours);
      const hours = Number.isFinite(n) ? Math.min(Math.max(n, 1), 168) : 24;
      const snapshot = await getOperatorSloSnapshot(drizzle, req.user.id, hours);

      const dimValues = Object.values(snapshot.dimensions) as string[];
      const banner_status = dimValues.includes("critical")
        ? "critical"
        : dimValues.includes("warn")
          ? "warn"
          : "ok";

      res.json({
        ...snapshot,
        banner_status,
        subscribable_events: ["slo.jobs.critical", "slo.webhooks.degraded", "slo.enrichment.dead"],
      });
    } catch (err: any) {
      res.status(500).json({ error: getErrorMessage(err) });
    }
  },
);

/**
 * GET /api/health/canary — On-demand or nightly demo-line health probe.
 *
 * Supports two auth modes with extreme precision:
 * 1. CRON_SECRET Bearer token (for the Vercel nightly cron at 04:00 UTC).
 *    Uses timingSafeEqual to prevent timing attacks.
 * 2. Authenticated user (JWT) for manual on-demand runs from the UI.
 *
 * The nightly run catches Vapi number/ assistant drift before prospects do.
 */
router.get(
  "/canary",
  healthRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    const expected = process.env.CRON_SECRET || "";
    const authz = String(req.headers.authorization || "");
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    const isCron =
      expected.length >= 16 &&
      token.length === expected.length &&
      cryptoTimingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"));

    if (isCron) {
      // Cron path — bypass user auth, run the probe, log outcome.
      try {
        const { runDemoLineCanary } = await import("../lib/demo-line-canary");
        const result = await runDemoLineCanary();
        if (!result.allHealthy) {
          log.warn("Demo-line canary nightly run detected unhealthy lines", {
            timestamp: result.timestamp,
            failedLines: result.lines
              .filter((l) => !l.numberOk || !l.assistantOk)
              .map((l) => l.tel),
          });
        }
        return res.status(result.allHealthy ? 200 : 503).json(result);
      } catch (err: any) {
        log.error("Demo-line canary cron failed", { error: getErrorMessage(err) });
        return res.status(500).json({ error: getErrorMessage(err) });
      }
    }

    // Not a cron — require normal user auth for on-demand use.
    return authenticateUser(req as AuthenticatedRequest, res, next);
  },
);

// The actual user-authenticated handler (chained after the gate above when not cron)
router.get("/canary", healthRateLimiter, authenticateUser, async (_req: Request, res: Response) => {
  try {
    const { runDemoLineCanary } = await import("../lib/demo-line-canary");
    const result = await runDemoLineCanary();
    res.status(result.allHealthy ? 200 : 503).json(result);
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

/**
 * POST /api/health/report — Client-side error ingestion.
 * Browser code POSTs uncaught errors here; they land in Vercel runtime
 * logs as structured JSON, searchable by source:"browser".
 * No auth required (errors happen before/during auth). Rate-limited.
 */
router.post("/report", healthRateLimiter, (req: Request, res: Response) => {
  const { message, stack, url, context } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ ok: false });
  }
  log.error("[client-error]", {
    source: "browser",
    message: message.slice(0, 2000),
    stack: typeof stack === "string" ? stack.slice(0, 4000) : undefined,
    pageUrl: typeof url === "string" ? url.slice(0, 500) : undefined,
    context: context && typeof context === "object" ? context : undefined,
    ua: req.get("user-agent")?.slice(0, 200),
  });
  return res.status(204).end();
});

export default router;
