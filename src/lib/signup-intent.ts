import { BOT_ROLE_TEMPLATES } from "./bot-product";
import { isUsageTierId, DEFAULT_PUBLIC_USAGE_TIER, type UsageTierId } from "./usage-billing-catalog";

export const SIGNUP_INTENT_STORAGE_KEY = "wireline_signup_intent_v1";
export const DEFAULT_ACTIVATION_PLAN_ID = "voice-regular";

// Signup attribution stores stable billing ids. Customer-facing URLs use the
// clean launch names below, while old links remain resolver-compatible.
export const SIGNUP_PLAN_IDS = [
  "usage",
  "personal",
  "voice",
  "email",
  "sms",
  "voice-email",
  "voice-sms",
  "email-sms",
  "omnichannel",
  "voice-regular",
  "voice-high",
  "email-regular",
  "email-high",
  "sms-regular",
  "sms-high",
  "voice-email-regular",
  "voice-email-high",
  "voice-sms-regular",
  "voice-sms-high",
  "email-sms-regular",
  "email-sms-high",
  "omnichannel-regular",
  "omnichannel-high",
  "starter",
  "team",
  "business",
] as const;
export type SignupPlanId = (typeof SIGNUP_PLAN_IDS)[number];

export const PUBLIC_SIGNUP_PLAN_SLUGS = {
  usage: "usage",
  personal: "personal",
  voice: "voice",
  email: "email",
  sms: "sms",
  "voice-email": "voice-email",
  "voice-sms": "voice-sms",
  "email-sms": "email-sms",
  omnichannel: "omnichannel",
  "voice-regular": "voice-regular",
  "voice-high": "voice-high",
  "email-regular": "email-regular",
  "email-high": "email-high",
  "sms-regular": "sms-regular",
  "sms-high": "sms-high",
  "voice-email-regular": "voice-email-regular",
  "voice-email-high": "voice-email-high",
  "voice-sms-regular": "voice-sms-regular",
  "voice-sms-high": "voice-sms-high",
  "email-sms-regular": "email-sms-regular",
  "email-sms-high": "email-sms-high",
  "omnichannel-regular": "omnichannel-regular",
  "omnichannel-high": "omnichannel-high",
  starter: "starter",
  team: "starter-plus",
  business: "pro",
} as const satisfies Record<SignupPlanId, string>;

export function publicSignupPlanSlug(planId: SignupPlanId): string {
  return PUBLIC_SIGNUP_PLAN_SLUGS[planId];
}

export function signupHrefForPlan(
  planId: SignupPlanId,
  options: {
    interval?: "month" | "year";
    template?: string;
    usageAddons?: UsageSignupAddons;
    usageTier?: UsageTierId;
  } = {},
): string {
  const params = new URLSearchParams({ plan: publicSignupPlanSlug(planId) });
  if (options.interval) params.set("interval", options.interval);
  if (options.template) params.set("template", options.template);
  if (planId === "usage") {
    params.set("interval", "month");
    if (options.usageTier) params.set("tier", options.usageTier);
    if (options.usageAddons) setUsageAddonParams(params, options.usageAddons);
  }
  return `/signup?${params.toString()}`;
}

export const SIGNUP_WEDGE_KEYS = [
  "home-services",
  "medical",
  "legal",
  "real-estate",
  "personal",
  "insurance",
  "restaurants",
  "sales",
  "support",
] as const;
export type SignupWedgeKey = (typeof SIGNUP_WEDGE_KEYS)[number];

export type UsageSignupAddons = { number: boolean; emailAddress: boolean };

function setUsageAddonParams(params: URLSearchParams, addons: UsageSignupAddons): void {
  params.set("number", addons.number ? "1" : "0");
  params.set("email_address", addons.emailAddress ? "1" : "0");
}

export function usageAddonsFromIntent(intent: SignupIntent | null | undefined): UsageSignupAddons {
  return {
    number: intent?.preferredUsageAddons?.number === true,
    emailAddress: intent?.preferredUsageAddons?.emailAddress === true,
  };
}

export type SignupIntent = {
  preferredUsageTier?: UsageTierId;
  preferredPlanId?: SignupPlanId;
  preferredUsageAddons?: UsageSignupAddons;
  preferredBillingInterval?: "month" | "year";
  preferredTemplateId?: string;
  signupWedge?: SignupWedgeKey;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  capturedAt: string;
};

export type SignupWedgeRecommendation = {
  label: string;
  defaultPlanId: SignupPlanId;
  templateId: (typeof BOT_ROLE_TEMPLATES)[number]["key"];
  templateLabel: string;
};

// Industry attribution selects a relevant starting role without selecting a
// paid package. Activation retains its own server-owned plan recommendation.
export const SIGNUP_WEDGE_RECOMMENDATIONS: Record<SignupWedgeKey, SignupWedgeRecommendation> = {
  "home-services": {
    label: "home services",
    defaultPlanId: "personal",
    templateId: "lead-qualifier",
    templateLabel: "Lead Qualifier",
  },
  medical: {
    label: "medical",
    defaultPlanId: "personal",
    templateId: "appointment-setter",
    templateLabel: "Appointment Setter",
  },
  legal: {
    label: "legal",
    defaultPlanId: "personal",
    templateId: "lead-qualifier",
    templateLabel: "Lead Qualifier",
  },
  "real-estate": {
    label: "real estate",
    defaultPlanId: "personal",
    templateId: "appointment-setter",
    templateLabel: "Appointment Setter",
  },
  personal: {
    label: "personal",
    defaultPlanId: "personal",
    templateId: "personal-assistant",
    templateLabel: "Personal Assistant",
  },
  insurance: {
    label: "insurance",
    defaultPlanId: "personal",
    templateId: "lead-qualifier",
    templateLabel: "Lead Qualifier",
  },
  restaurants: {
    label: "restaurants",
    defaultPlanId: "personal",
    templateId: "front-desk",
    templateLabel: "Front Desk",
  },
  sales: {
    label: "sales",
    defaultPlanId: "personal",
    templateId: "sales-rep",
    templateLabel: "Sales Rep",
  },
  support: {
    label: "customer coverage",
    defaultPlanId: "personal",
    templateId: "front-desk",
    templateLabel: "Front Desk",
  },
};

const PLAN_SET = new Set<string>(SIGNUP_PLAN_IDS);
const WEDGE_SET = new Set<string>(SIGNUP_WEDGE_KEYS);
const TEMPLATE_LABELS = new Map<string, string>(
  BOT_ROLE_TEMPLATES.map((template) => [template.key, template.name] as const),
);
const LEGACY_PLAN_ALIASES: Record<string, SignupPlanId> = {
  free: "personal",
  builder: "personal",
  free_builder: "personal",
  business_starter: "starter",
  businessstarter: "starter",
  starter_plus: "team",
  starterplus: "team",
  personal_plus: "team",
  personalplus: "team",
  shared: "team",
  pro: "business",
  business_starter_plus: "team",
  business_growth: "business",
  businessgrowth: "business",
  // Retired $159/Scale links resolve to the current top self-serve plan. The
  // pricing and checkout surfaces then offer the separate contact-sales path.
  enterprise: "business",
  custom: "business",
  scale: "business",
};

const PUBLIC_USAGE_PLAN_SLUGS: Record<string, UsageTierId> = {
  lite: "lite",
  business_lite: "lite",
  businesslite: "lite",
  plus: "plus",
  standard: "standard",
};

function usageTierFromPlanSlug(value: string | null | undefined): UsageTierId | undefined {
  const cleaned = value?.trim().toLowerCase();
  if (!cleaned) return undefined;
  const aliasKey = cleaned.replace(/[-\s]+/g, "_");
  if (Object.hasOwn(PUBLIC_USAGE_PLAN_SLUGS, aliasKey)) return PUBLIC_USAGE_PLAN_SLUGS[aliasKey];
  return Object.hasOwn(PUBLIC_USAGE_PLAN_SLUGS, cleaned)
    ? PUBLIC_USAGE_PLAN_SLUGS[cleaned]
    : undefined;
}

function normalizePlanId(value: string | null | undefined): SignupPlanId | undefined {
  const cleaned = value?.trim().toLowerCase();
  if (!cleaned) return undefined;
  if (PLAN_SET.has(cleaned)) return cleaned as SignupPlanId;
  const aliasKey = cleaned.replace(/[-\s]+/g, "_");
  return Object.hasOwn(LEGACY_PLAN_ALIASES, aliasKey)
    ? LEGACY_PLAN_ALIASES[aliasKey]
    : Object.hasOwn(LEGACY_PLAN_ALIASES, cleaned)
      ? LEGACY_PLAN_ALIASES[cleaned]
      : undefined;
}

function normalizeTemplateId(value: string | null | undefined): string | undefined {
  const cleaned = value?.trim().toLowerCase();
  return cleaned && TEMPLATE_LABELS.has(cleaned) ? cleaned : undefined;
}

export function signupTemplateLabel(templateId: string): string {
  return TEMPLATE_LABELS.get(templateId) || "Selected role";
}

/**
 * Drop or normalize plan/wedge values outside the current allowlist. Stale
 * localStorage and old marketing URLs can otherwise make signup fail silently.
 */
export function sanitizeSignupIntent(intent: SignupIntent | null | undefined): SignupIntent | null {
  if (!intent) return null;

  const out: SignupIntent = {
    capturedAt: intent.capturedAt || new Date().toISOString(),
  };

  const usageTierSlug = usageTierFromPlanSlug(intent.preferredPlanId);
  const normalizedPlan = usageTierSlug ? "usage" : normalizePlanId(intent.preferredPlanId);
  if (normalizedPlan) out.preferredPlanId = normalizedPlan;

  if (intent.preferredBillingInterval === "year" || intent.preferredBillingInterval === "month") {
    out.preferredBillingInterval = intent.preferredBillingInterval;
  }
  if (usageTierSlug) {
    out.preferredBillingInterval = "month";
    out.preferredUsageTier = usageTierSlug;
  } else if (normalizedPlan === "usage") {
    out.preferredBillingInterval = "month";
    if (isUsageTierId(intent.preferredUsageTier))
      out.preferredUsageTier = intent.preferredUsageTier;
    if (intent.preferredUsageAddons) out.preferredUsageAddons = usageAddonsFromIntent(intent);
  }

  const normalizedTemplate = normalizeTemplateId(intent.preferredTemplateId);
  if (normalizedTemplate) out.preferredTemplateId = normalizedTemplate;

  if (intent.signupWedge && WEDGE_SET.has(intent.signupWedge)) {
    out.signupWedge = intent.signupWedge;
  }

  const utmSource = cleanCampaignValue(intent.utmSource ?? null);
  const utmMedium = cleanCampaignValue(intent.utmMedium ?? null);
  const utmCampaign = cleanCampaignValue(intent.utmCampaign ?? null);
  if (utmSource) out.utmSource = utmSource;
  if (utmMedium) out.utmMedium = utmMedium;
  if (utmCampaign) out.utmCampaign = utmCampaign;

  return hasSignupIntent(out) ? out : null;
}

function cleanCampaignValue(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 120);
}

export function parseSignupIntent(search: string): SignupIntent | null {
  const params = new URLSearchParams(search);
  const rawPlan = params.get("plan");
  const rawWedge = params.get("wedge")?.trim().toLowerCase();

  const intent: SignupIntent = {
    capturedAt: new Date().toISOString(),
  };

  const usageTierSlug = usageTierFromPlanSlug(rawPlan);
  const normalizedPlan = usageTierSlug ? "usage" : normalizePlanId(rawPlan);
  if (normalizedPlan) intent.preferredPlanId = normalizedPlan;

  const rawInterval = params.get("interval")?.trim().toLowerCase();
  if (rawInterval === "year" || rawInterval === "month") {
    intent.preferredBillingInterval = rawInterval;
  }
  if (usageTierSlug) {
    intent.preferredBillingInterval = "month";
    intent.preferredUsageTier = usageTierSlug;
  } else if (normalizedPlan === "usage") {
    intent.preferredBillingInterval = "month";
    const tier = params.get("tier");
    if (isUsageTierId(tier)) intent.preferredUsageTier = tier;
    if (params.has("number") || params.has("email_address")) {
      intent.preferredUsageAddons = {
        number: params.get("number") === "1",
        emailAddress: params.get("email_address") === "1",
      };
    }
  }

  const normalizedTemplate = normalizeTemplateId(params.get("template"));
  if (normalizedTemplate) intent.preferredTemplateId = normalizedTemplate;

  if (rawWedge && WEDGE_SET.has(rawWedge)) {
    intent.signupWedge = rawWedge as SignupWedgeKey;
  }

  const utmSource = cleanCampaignValue(params.get("utm_source"));
  const utmMedium = cleanCampaignValue(params.get("utm_medium"));
  const utmCampaign = cleanCampaignValue(params.get("utm_campaign"));
  if (utmSource) intent.utmSource = utmSource;
  if (utmMedium) intent.utmMedium = utmMedium;
  if (utmCampaign) intent.utmCampaign = utmCampaign;

  return hasSignupIntent(intent) ? intent : null;
}

export function hasSignupIntent(intent: SignupIntent | null | undefined): intent is SignupIntent {
  return !!(
    intent?.preferredPlanId ||
    intent?.preferredBillingInterval ||
    intent?.preferredTemplateId ||
    intent?.signupWedge ||
    intent?.utmSource ||
    intent?.utmMedium ||
    intent?.utmCampaign
  );
}

export function getStoredSignupIntent(): SignupIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SIGNUP_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignupIntent;
    return sanitizeSignupIntent(parsed);
  } catch {
    return null;
  }
}

export function clearSignupIntent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SIGNUP_INTENT_STORAGE_KEY);
  } catch {
    // Storage can fail in private browsing; signup still works without attribution.
  }
}

export function persistSignupIntent(intent: SignupIntent | null): SignupIntent | null {
  const safe = sanitizeSignupIntent(intent);
  if (typeof window === "undefined") return safe;
  if (!safe) {
    clearSignupIntent();
    return null;
  }
  try {
    window.localStorage.setItem(SIGNUP_INTENT_STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Storage can fail in private browsing; signup still works without attribution.
  }
  return safe;
}

export function mergeSignupIntent(
  previous: SignupIntent | null | undefined,
  incoming: SignupIntent | null | undefined,
): SignupIntent | null {
  const next = sanitizeSignupIntent(incoming);
  if (!next) return sanitizeSignupIntent(previous);
  const prior = sanitizeSignupIntent(previous);
  const merged: SignupIntent = {
    ...(prior || {}),
    ...next,
    capturedAt: next.capturedAt,
  };
  // A new solution selection replaces an earlier role choice, while an
  // explicit role on the same link still takes precedence over that solution.
  if (next.signupWedge && !next.preferredTemplateId) delete merged.preferredTemplateId;
  return sanitizeSignupIntent(merged);
}

export function captureSignupIntentFromLocation(): SignupIntent | null {
  if (typeof window === "undefined") return null;
  const fromUrl = parseSignupIntent(window.location.search);
  if (fromUrl) {
    // Explicit plan CTAs (including generic Start free -> Free Builder) are
    // selection overrides, not attribution resets. Preserve the wedge, billing
    // interval, and campaign that brought the visitor here while letting the
    // URL's plan win. Other URL-only intents keep the historical replacement
    // behavior so a new wedge/UTM-only visit cannot resurrect a stale plan.
    const next = fromUrl.preferredPlanId
      ? mergeSignupIntent(getStoredSignupIntent(), fromUrl)
      : fromUrl;
    return persistSignupIntent(next);
  }
  const pathname = window.location.pathname;
  if (pathname === "/signup" || pathname === "/signup/") {
    // A plain Create Account visit is a new choice. Drop a Front Desk or Plus
    // chip left by an earlier link instead of signing the owner up for it.
    clearSignupIntent();
    return null;
  }
  return getStoredSignupIntent();
}

export function recommendedPlanFromIntent(intent: SignupIntent | null | undefined): SignupPlanId {
  if (intent?.preferredPlanId) return intent.preferredPlanId;
  if (intent?.signupWedge) return SIGNUP_WEDGE_RECOMMENDATIONS[intent.signupWedge].defaultPlanId;
  return "personal";
}

/** A current billing choice takes precedence over earlier signup attribution. */
export function billingIntervalFromIntent(
  intent: SignupIntent | null | undefined,
  search = "",
): "month" | "year" {
  const explicit = parseSignupIntent(search)?.preferredBillingInterval;
  return explicit || (intent?.preferredBillingInterval === "year" ? "year" : "month");
}

/** Carry signup preferences into the existing paid activation path. */
export function activationBillingHref(intent: SignupIntent | null | undefined): string {
  const recommended = recommendedPlanFromIntent(intent);
  const plan = ["starter", "team", "business"].includes(recommended)
    ? DEFAULT_ACTIVATION_PLAN_ID
    : recommended;
  const params = new URLSearchParams({
    plan,
    interval: plan === "usage" ? "month" : billingIntervalFromIntent(intent),
  });
  if (plan === "usage") {
    setUsageAddonParams(params, usageAddonsFromIntent(intent));
    if (isUsageTierId(intent?.preferredUsageTier)) params.set("tier", intent.preferredUsageTier);
  }
  return `/settings/billing?${params.toString()}`;
}

export function getSignupWedgeRecommendation(
  wedge: string | null | undefined,
): SignupWedgeRecommendation | null {
  if (!wedge || !WEDGE_SET.has(wedge)) return null;
  return SIGNUP_WEDGE_RECOMMENDATIONS[wedge as SignupWedgeKey];
}

export function signupHrefForWedge(wedge: SignupWedgeKey, planId?: SignupPlanId): string {
  const params = new URLSearchParams({ wedge });
  if (planId) params.set("plan", publicSignupPlanSlug(planId));
  return `/signup?${params.toString()}`;
}

export const SIGNUP_INTENT_SYNC_TIMEOUT_MS = 5_000;

/** Attribution is best effort and must never hold account access open indefinitely. */
export async function syncSignupIntent(intent: SignupIntent | null): Promise<void> {
  if (!hasSignupIntent(intent)) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SIGNUP_INTENT_SYNC_TIMEOUT_MS);
  try {
    const response = await fetch("/api/auth/signup-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(intent),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("signup intent sync failed", response.status);
    }
  } finally {
    clearTimeout(timeout);
  }
}
