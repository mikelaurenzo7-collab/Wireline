import { Router, type Request, type Response as ExpressResponse } from "express";
import { z } from "zod";

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
  createPublicOpenAILiveDemoCall,
  publicOpenAIDemoConfigured,
} from "../lib/voice/openai-public-demo-session";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";

const router = Router();
const assistantRateLimit = createIpRateLimiter({
  bucket: "public_assistant",
  windowMs: 60_000,
  max: PUBLIC_BROWSER_DEMO_REQUESTS_PER_MINUTE,
});

const ALL_PUBLIC_AGENTS = [...WIRELINE_DEMO_AGENTS, ...WIRELINE_CONTACT_AGENTS] as const;
const publicDemoCallSchema = z.object({
  sdp: z.string().min(100).max(60_000),
});

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
    throw AppError.fromHttpStatus(403, "The live demo is restricted to this BotBound page.");
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
        : "The live demo limit is reached for now. Try again later, or build your own Bot.",
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
  // BotBound is pre-scale and publishes no adoption counts until they are
  // backed by customer evidence. Keep the historical endpoint fail-closed so
  // stale clients cannot mistake example metrics for production telemetry.
  res.setHeader("Cache-Control", "no-store");
  res.status(404).json({
    error: "Public usage metrics are not published.",
    code: "public_metrics_unavailable",
    source: "not_published",
  });
});

router.get("/api/public/assistant/:agentName", assistantRateLimit, (req, res) => {
  const name = String(req.params.agentName || "").trim();
  const agent = publicAgent(name);
  if (!agent) throw AppError.fromHttpStatus(404, `Showcase Bot '${name}' not found`);
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=900");
  res.json({
    name: agent.name,
    role: agent.role,
    mode: "protected_native_browser_preview",
    maxDurationSeconds: PUBLIC_BROWSER_DEMO_MAX_SECONDS,
    sessionEndpoint: "/api/public/demo-session",
  });
});

router.post(
  "/api/public/demo-session",
  enforceLaunchHardGate,
  asyncHandler(async (req, res) => {
    const host = requireSameOrigin(req);
    if (!publicDemoTicketingReady() || !publicOpenAIDemoConfigured()) {
      throw AppError.fromHttpStatus(503, "The protected live demo is temporarily unavailable.");
    }

    const agentName = String(req.body?.agentName || "Liam")
      .trim()
      .slice(0, 80);
    const agent = publicAgent(agentName);
    if (!agent) throw AppError.fromHttpStatus(404, "That live demo Bot is unavailable.");

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
      providerSessionEndpoint: "/api/public/demo-call",
      expiresAt: new Date(claims.exp * 1_000).toISOString(),
      maxDurationSeconds: PUBLIC_BROWSER_DEMO_MAX_SECONDS,
    });
  }),
);

router.post(
  "/api/public/demo-call",
  enforceLaunchHardGate,
  asyncHandler(async (req, res) => {
    const host = requireSameOrigin(req);
    const token = bearerToken(req);
    if (!token) throw AppError.fromHttpStatus(401, "A protected demo ticket is required.");
    const parsedBody = publicDemoCallSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw AppError.fromHttpStatus(400, "A valid WebRTC offer is required.");
    }

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
    if (!agent) throw AppError.fromHttpStatus(404, "That live demo Bot is unavailable.");

    const session = await createPublicOpenAILiveDemoCall({
      agent,
      guestFingerprint: verification.claims.ip,
      sdp: parsedBody.data.sdp,
    });
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Wireline-Demo-Max-Seconds", String(PUBLIC_BROWSER_DEMO_MAX_SECONDS));
    res.json(session);
  }),
);

export default router;
