/**
 * Launch readiness — capability report. Voice is deliberately independent from
 * core platform readiness so its providers can be enabled without blocking AI,
 * inbox, text, email, or billing workflows.
 */
import { getIntegrationsStatus } from "./integrations-registry";
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
export type UserFacingLaunchReadinessDimension = {
  id: string;
  label: string;
  owner_surface: "studio" | "train" | "wire" | "billing" | "test";
};

export type LaunchReadinessReport = {
  overall_score: number;
  campaign_ready: boolean;
  hard_gate_enabled: boolean;
  capabilities: CapabilityReadiness[];
  launch_blockers: string[];
  generated_at: string;
  user_facing_agent_checks: UserFacingLaunchReadinessDimension[];
};

export const USER_FACING_AGENT_LAUNCH_CHECKS: UserFacingLaunchReadinessDimension[] = [
  {
    id: "identity-purpose",
    label: "Agent has name, role, and clear purpose",
    owner_surface: "studio",
  },
  {
    id: "training-material",
    label: "Training instructions or source material exist",
    owner_surface: "train",
  },
  {
    id: "handoff-policy",
    label: "Escalation/handoff policy is configured",
    owner_surface: "train",
  },
  {
    id: "outbound-consent",
    label: "Outbound consent posture is known when dialing is enabled",
    owner_surface: "wire",
  },
  { id: "channel-wiring", label: "Phone or channel wiring is complete", owner_surface: "wire" },
  {
    id: "usage-entitlement",
    label: "Conversation Balance or plan entitlement supports intended usage",
    owner_surface: "billing",
  },
  { id: "test-passed", label: "Test call or simulation has passed", owner_surface: "test" },
];

function levelFromBlockers(blockers: string[]): ReadinessLevel {
  if (blockers.length === 0) return "ready";
  if (blockers.length <= 1) return "degraded";
  return "blocked";
}
function envPresent(name: string): boolean {
  const value = process.env[name];
  return typeof value === "string" && value.length > 0;
}

export function evaluateLaunchReadiness(): LaunchReadinessReport {
  const integrations = getIntegrationsStatus();
  const byId = new Map(integrations.map((integration) => [integration.id, integration]));
  const envValidation = validateEnv();

  const voiceBlockers: string[] = [];
  if (byId.get("vapi")?.status !== "configured") voiceBlockers.push("VAPI_PRIVATE_KEY");
  if (!envPresent("VAPI_WEBHOOK_SECRET")) voiceBlockers.push("VAPI_WEBHOOK_SECRET");
  if (byId.get("elevenlabs")?.status !== "configured") voiceBlockers.push("ELEVENLABS_API_KEY");

  const billingBlockers: string[] = [];
  if (byId.get("stripe")?.status !== "configured") billingBlockers.push("STRIPE_SECRET_KEY");
  else if (!envPresent("STRIPE_WEBHOOK_SECRET")) billingBlockers.push("STRIPE_WEBHOOK_SECRET");
  if (
    process.env.BILLING_ENFORCE_METER === "true" &&
    !envPresent("STRIPE_VOICE_OVERAGE_METER_EVENT_NAME")
  ) {
    billingBlockers.push("STRIPE_VOICE_OVERAGE_METER_EVENT_NAME");
  }
  const marginCheck = assertPlanMarginFloors();
  if (!marginCheck.ok) billingBlockers.push(...marginCheck.violations);

  const complianceBlockers: string[] = [];
  if (!isFederalDncVendorConfigured()) {
    complianceBlockers.push("FEDERAL_DNC_API_URL+FEDERAL_DNC_API_KEY");
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
      label: "Voice stack",
      level: levelFromBlockers(voiceBlockers),
      blockers: voiceBlockers,
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
      id: "compliance_ready",
      label: "Outbound compliance",
      level: levelFromBlockers(complianceBlockers),
      blockers: complianceBlockers,
    },
  ];

  // Voice is surfaced as an operational capability, not a core launch gate.
  const launch_blockers = [...coreBlockers, ...billingBlockers, ...complianceBlockers];
  const readyCount = capabilities.filter((capability) => capability.level === "ready").length;

  return {
    overall_score: Math.round((readyCount / capabilities.length) * 100),
    campaign_ready: launch_blockers.length === 0,
    hard_gate_enabled: process.env.LAUNCH_HARD_GATE === "true",
    capabilities,
    launch_blockers,
    generated_at: new Date().toISOString(),
    user_facing_agent_checks: USER_FACING_AGENT_LAUNCH_CHECKS,
  };
}

export function isVoiceLaunchBlocked(): boolean {
  // Retained for route compatibility. Voice never blocks the core application.
  return false;
}

export function launchBlockResponse() {
  const report = evaluateLaunchReadiness();
  return {
    code: "LAUNCH_NOT_READY",
    error: "Core platform or billing is not launch-ready.",
    launch_blockers: report.launch_blockers,
    capabilities: report.capabilities,
  };
}
