import { Router, type Request, type Response as ExpressResponse } from "express";

import { AppError, asyncHandler } from "../lib/api-error";
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import {
  PUBLIC_BROWSER_DEMO_MAX_SECONDS,
  PUBLIC_BROWSER_DEMO_REQUESTS_PER_MINUTE,
} from "../lib/public-browser-demo";
import {
  admitPublicDemoTicketMint,
  admitPublicWebDemoSession,
  consumePublicDemoTicket,
  type PublicDemoAdmission,
} from "../lib/public-demo-budget";
import {
  issuePublicDemoTicket,
  publicDemoIpFingerprint,
  publicDemoTicketingReady,
  verifyPublicDemoTicket,
} from "../lib/public-demo-ticket";
import { rateLimit } from "../lib/rate-limit";
import {
  createPublicXAILiveDemoSession,
  publicXAIDemoConfigured,
} from "../lib/voice/xai-public-demo-session";
import { createIpRateLimiter } from "../middleware/api-rate-limits";

const router = Router();
const assistantRateLimit = createIpRateLimiter({
  bucket: "public_assistant",
  windowMs: 60_000,
  max: PUBLIC_BROWSER_DEMO_REQUESTS_PER_MINUTE,
});

const ALL_PUBLIC_AGENTS = [...WIRELINE_DEMO_AGENTS, ...WIRELINE_CONTACT_AGENTS] as const;

/** Static marketing counters — no live tenant aggregates or owner-role scans. */
const PUBLIC_MARKETING_STATS = {
  agents_online: 120,
  calls_this_month: 8400,
  tenants: 95,
} as const;

/**
 * Express trusts exactly one production proxy hop in server.ts. `req.ip` is
 * therefore the canonical client identity. Reading the left-most raw
 * X-Forwarded-For value here would let a caller supply a fresh rate-limit key
 * on every request and bypass both ticket and provider-spend ceilings.
 */
function requestIp(req: Request): string {
  return String(req.ip || "unknown").trim();
}

function requestHost(req: Request): string {
  return (req.headers["x-forwarded-host"]?.toString().split(",")[0] || req.get("host") || "")
    .trim()
    .toLowerCase();
}

function requireSameOrigin(req: Request): string {
  const host = requestHost(req);
  const origin = String(req.get("origin") || "").trim();
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

  if (!host || (!origin && isProduction)) {
    throw AppError.fromHttpStatus(403, "The live demo requires a same-origin browser request.");
  }
  if (!origin) return host;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw AppError.fromHttpStatus(403, "The live demo request origin is invalid.");
  }

  if (parsed.host.toLowerCase() !== host) {
    throw AppError.fromHttpStatus(403, "The live demo is restricted to this Wireline page.");
  }
  if (isProduction && parsed.protocol !== "https:") {
    throw AppError.fromHttpStatus(403, "The live demo requires a secure browser context.");
  }
  return host;
}

function bearerToken(req: Request): string {
  const authorization = String(req.get("authorization") || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

function publicAgent(name: string): ContactAgent | null {
  return (
    ALL_PUBLIC_AGENTS.find((item) => item.name.toLowerCase() === name.trim().toLowerCase()) ?? null
  );
}

function respondWithAdmissionDenial(
  res: ExpressResponse,
  denial: Exclude<PublicDemoAdmission, { admitted: true }>,
) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Retry-After", String(denial.retryAfterSeconds));
  res.status(denial.status).json({
    error:
      denial.status === 503
        ? "The protected live demo is temporarily unavailable."
        : "The live demo limit is reached for now. Try the public demo line instead.",
    code: denial.reason,
  });
}

router.get("/api/public/stats", async (req, res) => {
  const decision = await rateLimit(requestIp(req), {
    bucket: "public_stats",
    windowMs: 60_000,
    max: 30,
  });
  if (!decision.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(decision.resetMs / 1000)));
    throw AppError.fromHttpStatus(429, "Rate limit exceeded.");
  }
  res.setHeader(
    "Cache-Control",
    "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.json({
    ...PUBLIC_MARKETING_STATS,
    source: "static_example",
  });
});

/** Public metadata only; the prompt and ephemeral credential remain server-owned. */
router.get("/api/public/assistant/:agentName", assistantRateLimit, (req, res) => {
  const name = String(req.params.agentName || "").trim();
  const agent = publicAgent(name);
  if (!agent) throw AppError.fromHttpStatus(404, `Showcase agent '${name}' not found`);
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900");
  res.json({
    name: agent.name,
    role: agent.role,
    mode: "protected_native_browser_preview",
    maxDurationSeconds: PUBLIC_BROWSER_DEMO_MAX_SECONDS,
    sessionEndpoint: "/api/public/demo-session",
  });
});

/**
 * Cheap availability preflight. A one-use context-bound ticket is minted before
 * the microphone prompt; no xAI credential or provider spend occurs yet.
 */
router.post(
  "/api/public/demo-session",
  asyncHandler(async (req, res) => {
    const host = requireSameOrigin(req);
    if (!publicDemoTicketingReady() || !publicXAIDemoConfigured()) {
      throw AppError.fromHttpStatus(503, "The protected live demo is temporarily unavailable.");
    }

    const agentName = String(req.body?.agentName || "Liam")
      .trim()
      .slice(0, 80);
    const agent = publicAgent(agentName);
    if (!agent) throw AppError.fromHttpStatus(404, "That live demo agent is unavailable.");

    const ip = requestIp(req);
    const fingerprint = publicDemoIpFingerprint(ip);
    const admission = await admitPublicDemoTicketMint(fingerprint);
    if (!admission.admitted) {
      respondWithAdmissionDenial(res, admission);
      return;
    }

    const { token, claims } = issuePublicDemoTicket({ ip, host, agentName: agent.name });
    res.setHeader("Cache-Control", "no-store");
    res.json({
      token,
      providerSessionEndpoint: "/api/public/demo-xai-session",
      expiresAt: new Date(claims.exp * 1_000).toISOString(),
      maxDurationSeconds: PUBLIC_BROWSER_DEMO_MAX_SECONDS,
    });
  }),
);

/**
 * Provider session mint. The browser calls this only after microphone access is
 * granted. The ticket is consumed exactly once and the distributed spend
 * ceilings are charged before an ephemeral xAI client secret is created.
 */
router.post(
  "/api/public/demo-xai-session",
  asyncHandler(async (req, res) => {
    const host = requireSameOrigin(req);
    const token = bearerToken(req);
    if (!token) throw AppError.fromHttpStatus(401, "A protected demo ticket is required.");

    const ip = requestIp(req);
    const verification = verifyPublicDemoTicket({ token, ip, host });
    if (!verification.ok) {
      throw AppError.fromHttpStatus(401, "The protected demo ticket is invalid or expired.");
    }

    const ticketAdmission = await consumePublicDemoTicket(verification.claims.jti);
    if (!ticketAdmission.admitted) {
      respondWithAdmissionDenial(res, ticketAdmission);
      return;
    }

    const budgetAdmission = await admitPublicWebDemoSession(verification.claims.ip);
    if (!budgetAdmission.admitted) {
      respondWithAdmissionDenial(res, budgetAdmission);
      return;
    }

    const agent = publicAgent(verification.claims.agent);
    if (!agent) throw AppError.fromHttpStatus(404, "That live demo agent is unavailable.");

    const session = await createPublicXAILiveDemoSession(agent);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Wireline-Demo-Max-Seconds", String(PUBLIC_BROWSER_DEMO_MAX_SECONDS));
    res.json(session);
  }),
);

export default router;
