/**
 * Launch readiness — capability report for the product BotBound actually sells.
 * Voice and a working number are guaranteed for active paid Bots. Managed
 * AgentMail inboxes are the Bot email identity; Resend remains transactional
 * platform email and signed delivery feedback. Customer OAuth mailboxes, SMS,
 * artifacts, and workspace integrations remain optional capabilities.
 *
 * Federal DNC is intentionally deferred from the platform GO / score gate until
 * the founder completes business registration with DNCScrub. Marketing outbound
 * still fails closed at runtime via `assertFederalDncForMarketing()`, and the
 * separate outbound_campaign_ready field remains false while any deferred
 * outbound checklist item is incomplete.
 */
import { selfServeBillingReleaseBlockers } from "./billing-release";
import { getIntegrationsStatus } from "./integrations-registry";
import { validateEnv } from "./env-validator";
import { assertPlanMarginFloors } from "./tenant-economics";
import { isFederalDncVendorConfigured } from "./federal-dnc-service";
import { isPersistentVoiceWorkerConfigured } from "./voice/openai-sip-worker-config";

export type ReadinessLevel = "ready" | "degraded" | "blocked";
export type CapabilityReadiness = {
  id: string;
  label: string;
  level: ReadinessLevel;
  blockers: string[];
};
export type LaunchReadinessReport = {
  overall_score: number;
  /** Backward-compatible platform readiness signal used by the existing hard gate. */
  campaign_ready: boolean;
  /** True only when the platform and every deferred outbound control are ready. */
  outbound_campaign_ready: boolean;
  hard_gate_enabled: boolean;
  self_serve_billing_enabled: boolean;
  capabilities: CapabilityReadiness[];
  launch_blockers: string[];
  /** Ops checklist items that do not fail platform GO / score / hard-gate. */
  deferred_checklist: string[];
  generated_at: string;
};

/** Capability ids that contribute to overall_score and platform campaign_ready. */
const SCORE_CAPABILITY_IDS = new Set(["core_ready", "billing_ready", "voice_ready", "email_ready"]);

function levelFromBlockers(blockers: string[]): ReadinessLevel {
  if (blockers.length === 0) return "ready";
  if (blockers.length <= 1) return "degraded";
  return "blocked";
}
function envPresent(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluateLaunchReadiness(): LaunchReadinessReport {
  const integrations = getIntegrationsStatus();
  const byId = new Map(integrations.map((integration) => [integration.id, integration]));
  const envValidation = validateEnv();
  const billingReleaseBlockers = selfServeBillingReleaseBlockers();
  const billingReleased = billingReleaseBlockers.length === 0;

  const voiceBlockers: string[] = [];
  if (!isPersistentVoiceWorkerConfigured())
    voiceBlockers.push("WIRELINE_VOICE_WORKER_URL+WIRELINE_VOICE_WORKER_SECRET");
  if (!envPresent("OPENAI_API_KEY")) voiceBlockers.push("OPENAI_API_KEY");
  if (!envPresent("OPENAI_PROJECT_ID")) voiceBlockers.push("OPENAI_PROJECT_ID");
  if (!envPresent("OPENAI_WEBHOOK_SECRET")) voiceBlockers.push("OPENAI_WEBHOOK_SECRET");
  if (byId.get("twilio")?.status !== "configured") {
    voiceBlockers.push("TWILIO_ACCOUNT_SID+TWILIO_AUTH_TOKEN");
  }

  const billingBlockers: string[] = [];
  if (byId.get("stripe")?.status !== "configured") billingBlockers.push("STRIPE_SECRET_KEY");
  else if (!envPresent("STRIPE_WEBHOOK_SECRET")) billingBlockers.push("STRIPE_WEBHOOK_SECRET");
  billingBlockers.push(...billingReleaseBlockers);
  const marginCheck = assertPlanMarginFloors();
  if (!marginCheck.ok) billingBlockers.push(...marginCheck.violations);

  const deferred_checklist: string[] = [];
  if (!isFederalDncVendorConfigured()) {
    deferred_checklist.push("FEDERAL_DNC_API_URL+FEDERAL_DNC_API_KEY");
  }

  const emailBlockers: string[] = [];
  if (!envPresent("AGENTMAIL_API_KEY")) emailBlockers.push("AGENTMAIL_API_KEY");
  if (byId.get("resend")?.status !== "configured") emailBlockers.push("RESEND_API_KEY");
  if (byId.get("resend-feedback")?.status !== "configured") {
    emailBlockers.push("RESEND_WEBHOOK_SECRET");
  }
  const oauthBlockers: string[] = [];
  if (!envPresent("GOOGLE_CLIENT_ID")) oauthBlockers.push("GOOGLE_CLIENT_ID");
  if (!envPresent("MICROSOFT_CLIENT_ID")) oauthBlockers.push("MICROSOFT_CLIENT_ID");
  const coreBlockers = envValidation.valid ? [] : envValidation.errors.map((error) => error.var);

  const capabilities: CapabilityReadiness[] = [
    {
      id: "core_ready",
      label: "Core platform",
      level: levelFromBlockers(coreBlockers),
      blockers: coreBlockers,
    },
    {
      id: "billing_ready",
      label: "Billing",
      level: levelFromBlockers(billingBlockers),
      blockers: billingBlockers,
    },
    {
      id: "voice_ready",
      label: "PSTN voice + Twilio number stack",
      level: levelFromBlockers(voiceBlockers),
      blockers: voiceBlockers,
    },
    {
      id: "email_ready",
      label: "Managed AgentMail + transactional delivery",
      level: levelFromBlockers(emailBlockers),
      blockers: emailBlockers,
    },
    {
      id: "oauth_ready",
      label: "Optional Google/Microsoft connections",
      level: levelFromBlockers(oauthBlockers),
      blockers: oauthBlockers,
    },
    {
      id: "compliance_ready",
      label: "Outbound compliance (deferred checklist)",
      // Visible degraded state for ops; excluded from platform score / GO / hard-gate.
      level: deferred_checklist.length === 0 ? "ready" : "degraded",
      blockers: [...deferred_checklist],
    },
  ];

  const launch_blockers = [...coreBlockers, ...billingBlockers, ...voiceBlockers, ...emailBlockers];
  const scored = capabilities.filter((capability) => SCORE_CAPABILITY_IDS.has(capability.id));
  const readyCount = scored.filter((capability) => capability.level === "ready").length;
  const campaignReady = launch_blockers.length === 0 && readyCount === scored.length;
  const outboundCampaignReady = campaignReady && deferred_checklist.length === 0;

  return {
    overall_score: Math.round((readyCount / scored.length) * 100),
    campaign_ready: campaignReady,
    outbound_campaign_ready: outboundCampaignReady,
    hard_gate_enabled: process.env.LAUNCH_HARD_GATE === "true",
    self_serve_billing_enabled: billingReleased,
    capabilities,
    launch_blockers,
    deferred_checklist,
    generated_at: new Date().toISOString(),
  };
}

/** True when LAUNCH_HARD_GATE=true and any platform launch capability is not ready. */
export function isLaunchHardBlocked(): boolean {
  if (process.env.LAUNCH_HARD_GATE !== "true") return false;
  return !evaluateLaunchReadiness().campaign_ready;
}

export function isVoiceLaunchBlocked(): boolean {
  const voice = evaluateLaunchReadiness().capabilities.find(
    (capability) => capability.id === "voice_ready",
  );
  return voice?.level !== "ready";
}

export function launchBlockResponse() {
  const report = evaluateLaunchReadiness();
  return {
    code: "LAUNCH_NOT_READY",
    error:
      "Launch hard gate is on and BotBound is not launch-ready (voice, billing, managed email, or core).",
    outbound_campaign_ready: report.outbound_campaign_ready,
    launch_blockers: report.launch_blockers,
    deferred_checklist: report.deferred_checklist,
    capabilities: report.capabilities,
  };
}
