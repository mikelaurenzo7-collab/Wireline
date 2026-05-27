import type { StripePlanId } from "./plan-catalog";

const PAID_TIERS = new Set<StripePlanId>(["pro", "business", "enterprise"]);

export function normalizeAiTier(tier?: string | null): StripePlanId | "starter" {
  const raw = String(tier || "starter").toLowerCase();
  if (
    raw === "personal" ||
    raw === "starter" ||
    raw === "pro" ||
    raw === "business" ||
    raw === "enterprise"
  ) {
    return raw;
  }
  return "starter";
}

export interface VoiceLatencyProfile {
  silenceTimeoutSeconds: number;
  responseDelaySeconds: number;
  numWordsToInterruptAssistant: number;
  optimizeStreamingLatency: number;
}

/**
 * Subscription-tier + role latency tuning for tenant voice agents.
 * Paid tiers get snappier turn-taking; sales/outbound roles get shorter silence windows.
 */
export function getVoiceLatencyProfile(input: {
  aiTier?: string | null;
  archetype?: string;
  role?: string;
  isOutbound?: boolean;
}): VoiceLatencyProfile {
  const tier = normalizeAiTier(input.aiTier);
  const paid = PAID_TIERS.has(tier as StripePlanId);
  const role = input.role || "customer_service";
  const salesLike =
    input.isOutbound || ["sales", "lead_qualifier", "collections", "scheduler"].includes(role);

  const archetypeBase: Record<string, number> = {
    "The Closer": 2,
    "The Hunter": 2,
    "The Negotiator": 3,
    Scheduler: 4,
    Receptionist: 5,
  };

  const archetype = input.archetype || "Receptionist";
  let silenceTimeoutSeconds = archetypeBase[archetype] ?? (salesLike ? 3 : 5);

  if (paid && salesLike) silenceTimeoutSeconds = Math.min(silenceTimeoutSeconds, 2);
  if (paid && !salesLike) silenceTimeoutSeconds = Math.min(silenceTimeoutSeconds, 4);

  return {
    silenceTimeoutSeconds,
    responseDelaySeconds: 0,
    numWordsToInterruptAssistant: paid ? 2 : 3,
    // Reduced from 4/3 → 2/2. Higher values (3-4) maximize speed at the
    // cost of TTS prosody quality — ElevenLabs renders more aggressively
    // compressed audio that amplifies cadence inconsistency when the LLM
    // feeds varying-length text chunks. Level 2 is the sweet spot:
    // perceptibly fast first-audio-out without the jarring speed shifts.
    optimizeStreamingLatency: paid ? 2 : 2,
  };
}
