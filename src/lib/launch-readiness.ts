/**
 * Launch readiness — capability report for the product Wireline actually sells.
 * Voice and a working number are guaranteed, while email, SMS, and artifacts are
 * optional connected capabilities.
 *
 * Federal DNC is intentionally deferred from the GO / score gate until the
 * founder completes business registration with DNCScrub. Marketing outbound
 * still fails closed at runtime via `assertFederalDncForMarketing()`.
 */
import { selfServeBillingReleaseBlockers } from "./billing-release";
import { getRuntimeIntegrationStatus } from "./runtime-integrations-registry";
import { validateEnv } from "./env-validator";
import { assertPlanMarginFloors } from "./tenant-economics";
import { isFederalDncVendorConfigured } from "./federal-dnc-service";

export type ReadinessLevel = "ready" | "degraded" | "blocked";
export type CapabilityReadiness = {
  id: string;
  label: string;
  level: ReadinessLevel;
  blockers: string[];
};
export type LaunchReadinessReport = {
  overall_score: number;
  campaign_ready: boolean;
  hard_gate_enabled: boolean;
  self_serve_billing_enabled: boolean;
  capabilities: CapabilityReadiness[];
  launch_blockers: string[];
  /** Ops checklist items that do not fail GO / score / hard-gate. */
  deferred_checklist: string[];
  generated_at: string;
};

/** Capability ids that contribute to overall_score and campaign_ready. */
const SCORE_CAPABILITY_IDS = new Set([
  "core_ready",
  "billing_ready",
  "voice_ready",
  "email_ready",
  "oauth_ready",
]);

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
  const integrations = getRuntimeIntegrationStatus();
  const byId = new Map(integrations.map((integration) => [integration.id, integration]));
  const envValidation = validateEnv();
  const billingReleaseBlockers = selfServeBillingReleaseBlockers();
  const billingReleased = billingReleaseBlockers.length === 0;

  const voiceBlockers: string[] = [];
  if (byId.get("openai")?.status !== "configured") voiceBlockers.push("OPENAI_API_KEY");
  if (byId.get("vapi")?.status !== "configured") voiceBlockers.push("VAPI_PRIVATE_KEY");
  if (!envPresent("VAPI_WEBHOOK_SECRET")) voiceBlockers.push("VAPI_WEBHOOK_SECRET");
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
  if (byId.get("resend")?.status !== "configured") emailBlockers.push("RESEND_API_KEY");
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
      label: "PSTN voice + number stack",
      level: levelFromBlockers(voiceBlockers),
      blockers: voiceBlockers,
    },
    {
      id: "email_ready",
      label: "Optional platform email",
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
      // Visible degraded state for ops; excluded from score / GO / hard-gate.
      level: deferred_checklist.length === 0 ? "ready" : "degraded",
      blockers: [...deferred_checklist],
    },
  ];

  const launch_blockers = [...coreBlockers, ...billingBlockers, ...voiceBlockers];
  const scored = capabilities.filter((capability) => SCORE_CAPABILITY_IDS.has(capability.id));
  const readyCount = scored.filter((capability) => capability.level === "ready").length;

  return {
    overall_score: Math.round((readyCount / scored.length) * 100),
    campaign_ready: launch_blockers.length === 0,
    hard_gate_enabled: process.env.LAUNCH_HARD_GATE === "true",
    self_serve_billing_enabled: billingReleased,
    capabilities,
    launch_blockers,
    deferred_checklist,
    generated_at: new Date().toISOString(),
  };
}

/** True when LAUNCH_HARD_GATE=true and any launch capability is not ready. */
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
    error: "Launch hard gate is on and Wireline is not launch-ready (voice, billing, or core).",
    launch_blockers: report.launch_blockers,
    deferred_checklist: report.deferred_checklist,
    capabilities: report.capabilities,
  };
}
