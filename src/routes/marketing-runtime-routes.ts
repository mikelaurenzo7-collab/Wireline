import { Router, type Request, type Response as ExpressResponse } from "express";

import { AppError } from "../lib/api-error";
import { VAPI_SHOWCASE_MODEL, VAPI_SHOWCASE_PROVIDER } from "../lib/ai-models";
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import {
  admitPublicDemoTicketMint,
  admitPublicWebDemoSession,
  consumePublicDemoTicket,
  PUBLIC_DEMO_MAX_DURATION_SECONDS,
  type PublicDemoAdmission,
} from "../lib/public-demo-budget";
import {
  issuePublicDemoTicket,
  publicDemoIpFingerprint,
  publicDemoTicketingReady,
  verifyPublicDemoTicket,
} from "../lib/public-demo-ticket";
import { rateLimit } from "../lib/rate-limit";
import { log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { resolveVapiSpeechPipeline } from "../lib/voice-agent-profile";
import { createIpRateLimiter } from "../middleware/api-rate-limits";

const router = Router();
const assistantRateLimit = createIpRateLimiter({
  bucket: "public_assistant",
  windowMs: 60_000,
  max: 30,
});

const ALL_PUBLIC_AGENTS = [...WIRELINE_DEMO_AGENTS, ...WIRELINE_CONTACT_AGENTS] as const;

/** Static marketing counters — no live tenant aggregates (avoids owner-role DB scans). */
const PUBLIC_MARKETING_STATS = {
  agents_online: 120,
  calls_this_month: 8400,
  tenants: 95,
} as const;

function requestIp(req: Request): string {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
    req.ip ||
    "unknown"
  ).trim();
}

function requestHost(req: Request): string {
  return (
    req.headers["x-forwarded-host"]?.toString().split(",")[0] ||
    req.get("host") ||
    ""
  )
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
        : "The live demo limit is reached for now. Build free to continue.",
    code: denial.reason,
  });
}

function buildPublicBrowserAssistant(agent: ContactAgent) {
  const speech = resolveVapiSpeechPipeline(agent.transcriberMode || "flux-eot");
  const systemPrompt = [
    `You are ${agent.name}, demonstrating a Wireline voice agent in a protected browser call.`,
    agent.scope,
    "The visitor may give you a customer situation, personal task, or business request. Show how you would answer, qualify, follow up, or book the next step.",
    "Keep every turn under 18 words. Ask no more than one question at a time.",
    "This is a short role-play. Do not collect sensitive data, phone numbers, payment details, health details, legal details, or email addresses.",
    "Do not create real records, appointments, messages, payments, transfers, or external commitments.",
    "When time is nearly up, summarize the value in one sentence and invite the visitor to build their own agent free.",
  ].join("\n\n");

  return {
    name: `Wireline Protected Web Demo — ${agent.name}`,
    firstMessage:
      "Hi, I’m a live Wireline voice agent. Give me a customer situation or task, and I’ll show you how I’d handle it.",
    model: {
      provider: VAPI_SHOWCASE_PROVIDER,
      model: VAPI_SHOWCASE_MODEL,
      systemPrompt,
      temperature: 0.3,
    },
    voice: {
      provider: "vapi",
      voiceId: agent.vapiVoiceId || "Elliot",
      version: 2,
    },
    transcriber: speech.transcriber,
    startSpeakingPlan: speech.startSpeakingPlan,
    maxDurationSeconds: PUBLIC_DEMO_MAX_DURATION_SECONDS,
    artifactPlan: {
      recordingEnabled: false,
      videoRecordingEnabled: false,
      pcapEnabled: false,
      loggingEnabled: false,
      transcriptPlan: { enabled: false },
    },
    hooks: [
      {
        on: "call.timeElapsed",
        options: { seconds: 36 },
        do: [
          {
            type: "message.add",
            message: {
              role: "system",
              content:
                "The protected demo is nearly complete. Finish the current answer, summarize the value in one sentence, and invite the visitor to start free.",
            },
          },
        ],
      },
      {
        on: "call.timeElapsed",
        options: { seconds: 43 },
        do: [
          {
            type: "say",
            exact: "That’s the demo. Build your own Wireline voice agent free when you’re ready.",
          },
          { type: "tool", tool: { type: "endCall" } },
        ],
      },
    ],
    serverMessages: [],
    clientMessages: ["transcript", "hang", "speech-update", "conversation-update", "status-update"],
  };
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

/**
 * Legacy assistant-preview endpoint retained for non-spend configuration
 * inspection. Browser calls no longer use its transient payload directly.
 */
router.get("/api/public/assistant/:agentName", assistantRateLimit, (req, res) => {
  const name = String(req.params.agentName || "").trim();
  const agent = publicAgent(name);
  if (!agent) throw AppError.fromHttpStatus(404, `Showcase agent '${name}' not found`);
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(buildPublicBrowserAssistant(agent));
});

router.post("/api/public/demo-session", async (req, res) => {
  const host = requireSameOrigin(req);
  if (!publicDemoTicketingReady()) {
    throw AppError.fromHttpStatus(503, "The protected live demo is temporarily unavailable.");
  }

  const agentName = String(req.body?.agentName || "Liam").trim();
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
    proxyUrl: "/api/public/demo-vapi",
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    maxDurationSeconds: PUBLIC_DEMO_MAX_DURATION_SECONDS,
  });
});

router.post("/api/public/demo-vapi/call/web", async (req, res) => {
  const host = requireSameOrigin(req);
  const authorization = String(req.get("authorization") || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
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

  const privateKey = String(process.env.VAPI_PRIVATE_KEY || "").trim();
  if (!privateKey) {
    throw AppError.fromHttpStatus(503, "The protected live demo is temporarily unavailable.");
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch("https://api.vapi.ai/call/web", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${privateKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ assistant: buildPublicBrowserAssistant(agent) }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error: unknown) {
    log.error("protected public demo proxy failed", { error: getErrorMessage(error) });
    throw AppError.fromHttpStatus(502, "The live voice provider is temporarily unavailable.");
  }

  const responseBody = await upstream.text();
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Wireline-Demo-Max-Seconds", String(PUBLIC_DEMO_MAX_DURATION_SECONDS));
  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
  res.send(responseBody);
});

export default router;
