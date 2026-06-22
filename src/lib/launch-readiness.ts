/**
 * Launch readiness — soft campaign gate (fail-open boot preserved in startup.ts).
 */
import { getIntegrationsStatus } from "./integrations-registry";
import { validateEnv } from "./env-validator";

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
  capabilities: CapabilityReadiness[];
  launch_blockers: string[];
  generated_at: string;
};

function levelFromBlockers(blockers: string[]): ReadinessLevel {
  if (blockers.length === 0) return "ready";
  if (blockers.length <= 1) return "degraded";
  return "blocked";
}

function envPresent(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.length > 0;
}

export function evaluateLaunchReadiness(): LaunchReadinessReport {
  const integrations = getIntegrationsStatus();
  const byId = new Map(integrations.map((i) => [i.id, i]));
  const envValidation = validateEnv();

  const voiceBlockers: string[] = [];
  if (byId.get("vapi")?.status !== "configured") voiceBlockers.push("VAPI_PRIVATE_KEY");
  if (!envPresent("VAPI_WEBHOOK_SECRET")) voiceBlockers.push("VAPI_WEBHOOK_SECRET");
  if (byId.get("elevenlabs")?.status !== "configured") voiceBlockers.push("ELEVENLABS_API_KEY");

  const billingBlockers: string[] = [];
  if (byId.get("stripe")?.status !== "configured") {
    billingBlockers.push("STRIPE_SECRET_KEY");
  } else if (!envPresent("STRIPE_WEBHOOK_SECRET")) {
    // Checkout can create a subscription without a webhook secret, but the
    // application cannot safely reconcile or revoke entitlement changes.
    billingBlockers.push("STRIPE_WEBHOOK_SECRET");
  }
  if (
    process.env.BILLING_ENFORCE_METER === "true" &&
    !envPresent("STRIPE_VOICE_OVERAGE_METER_EVENT_NAME")
  ) {
    billingBlockers.push("STRIPE_VOICE_OVERAGE_METER_EVENT_NAME");
  }

  const emailBlockers: string[] = [];
  if (byId.get("resend")?.status !== "configured") emailBlockers.push("RESEND_API_KEY");

  const oauthBlockers: string[] = [];
  if (!envPresent("GOOGLE_CLIENT_ID")) oauthBlockers.push("GOOGLE_CLIENT_ID");
  if (!envPresent("MICROSOFT_CLIENT_ID")) oauthBlockers.push("MICROSOFT_CLIENT_ID");

  const capabilities: CapabilityReadiness[] = [
    {
      id: "voice_ready",
      label: "Voice stack",
      level: levelFromBlockers(voiceBlockers),
      blockers: voiceBlockers,
    },
    {
      id: "billing_ready",
      label: "Billing",
      level: levelFromBlockers(billingBlockers),
      blockers: billingBlockers,
    },
    {
      id: "email_ready",
      label: "Email",
      level: levelFromBlockers(emailBlockers),
      blockers: emailBlockers,
    },
    {
      id: "oauth_ready",
      label: "OAuth sign-in",
      level: levelFromBlockers(oauthBlockers),
      blockers: oauthBlockers,
    },
    {
      id: "core_ready",
      label: "Core platform",
      level: envValidation.valid ? "ready" : "blocked",
      blockers: envValidation.valid ? [] : envValidation.errors.map((e) => e.var),
    },
  ];

  const launch_blockers = [...voiceBlockers, ...billingBlockers];

  const readyCount = capabilities.filter((c) => c.level === "ready").length;
  const overall_score = Math.round((readyCount / capabilities.length) * 100);

  return {
    overall_score,
    campaign_ready: voiceBlockers.length === 0 && billingBlockers.length === 0,
    hard_gate_enabled: process.env.LAUNCH_HARD_GATE === "true",
    capabilities,
    launch_blockers,
    generated_at: new Date().toISOString(),
  };
}

export function isVoiceLaunchBlocked(): boolean {
  if (process.env.LAUNCH_HARD_GATE !== "true") return false;
  const report = evaluateLaunchReadiness();
  return report.capabilities.find((c) => c.id === "voice_ready")?.level === "blocked";
}

export function launchBlockResponse() {
  const report = evaluateLaunchReadiness();
  return {
    code: "LAUNCH_NOT_READY",
    error: "Voice or billing stack is not launch-ready.",
    launch_blockers: report.launch_blockers,
    capabilities: report.capabilities,
  };
}
