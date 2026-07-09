import { Router } from "express";
import { rateLimit } from "../lib/rate-limit";
import { AppError } from "../lib/api-error";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS } from "../data/contact-agents";
import { VAPI_SHOWCASE_MODEL, VAPI_SHOWCASE_PROVIDER } from "../lib/ai-models";
import { resolveVapiSpeechPipeline } from "../lib/voice-agent-profile";

const router = Router();
const assistantRateLimit = createIpRateLimiter({
  bucket: "public_assistant",
  windowMs: 60_000,
  max: 30,
});

/** Static marketing counters — no live tenant aggregates (avoids owner-role DB scans). */
const PUBLIC_MARKETING_STATS = {
  agents_online: 120,
  calls_this_month: 8400,
  tenants: 95,
} as const;

router.get("/api/public/stats", async (req, res) => {
  const ip = (
    req.headers["x-forwarded-for"]?.toString().split(",")[0] ||
    req.ip ||
    "unknown"
  ).trim();
  const decision = await rateLimit(ip, { bucket: "public_stats", windowMs: 60_000, max: 30 });
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
    as_of: new Date().toISOString(),
  });
});

router.get("/api/public/assistant/:agentName", assistantRateLimit, (req, res) => {
  const name = String(req.params.agentName || "").trim();
  const agent = [...WIRELINE_DEMO_AGENTS, ...WIRELINE_CONTACT_AGENTS].find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  );
  if (!agent) throw AppError.fromHttpStatus(404, `Showcase agent '${name}' not found`);
  const isDemo = WIRELINE_DEMO_AGENTS.some((item) => item.name === agent.name);
  const speech = resolveVapiSpeechPipeline(agent.transcriberMode || "flux-eot");
  const systemPrompt = [
    `You are ${agent.name}, the ${agent.role} for a Wireline showcase call.`,
    agent.scope,
    "Speak naturally, remain in role, never fabricate business commitments, and keep the conversation focused on the caller's request.",
    isDemo
      ? "This is a role-play demo. Do not create real owner follow-up, customer records, payments, or external commitments."
      : "Escalate sensitive, risky, or unresolved requests to a human teammate.",
  ].join("\n\n");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({
    name: `Wireline Showcase — ${agent.name}`,
    firstMessage: agent.firstMessage,
    model: {
      provider: VAPI_SHOWCASE_PROVIDER,
      model: VAPI_SHOWCASE_MODEL,
      systemPrompt,
      temperature: 0.35,
    },
    voice: {
      provider: "11labs",
      voiceId: agent.voiceId,
      model: "eleven_flash_v2_5",
      stability: agent.voiceSettings?.stability ?? 0.55,
      similarityBoost: agent.voiceSettings?.similarityBoost ?? 0.86,
      style: agent.voiceSettings?.style ?? 0.12,
      speed: agent.voiceSettings?.speed ?? 1,
      useSpeakerBoost: true,
    },
    transcriber: speech.transcriber,
    startSpeakingPlan: speech.startSpeakingPlan,
    serverMessages: ["end-of-call-report", "status-update", "conversation-update"],
    clientMessages: ["transcript", "hang", "speech-update", "conversation-update"],
  });
});

export default router;
