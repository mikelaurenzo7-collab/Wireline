export const SIGNUP_INTENT_STORAGE_KEY = "wireline_signup_intent_v1";

export const SIGNUP_PLAN_IDS = ["personal", "starter", "team", "business", "enterprise"] as const;
export type SignupPlanId = (typeof SIGNUP_PLAN_IDS)[number];

export const SIGNUP_WEDGE_KEYS = [
  "home-services",
  "medical",
  "legal",
  "real-estate",
  "personal",
  "insurance",
  "restaurants",
  "sales",
] as const;
export type SignupWedgeKey = (typeof SIGNUP_WEDGE_KEYS)[number];

export type SignupIntent = {
  preferredPlanId?: SignupPlanId;
  signupWedge?: SignupWedgeKey;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  capturedAt: string;
};

export type SignupWedgeRecommendation = {
  label: string;
  defaultPlanId: SignupPlanId;
  templateId: string;
  templateLabel: string;
};

export const SIGNUP_WEDGE_RECOMMENDATIONS: Record<SignupWedgeKey, SignupWedgeRecommendation> = {
  "home-services": {
    label: "home services",
    defaultPlanId: "team",
    templateId: "lead-qualifier-inbound",
    templateLabel: "Inbound Lead Qualifier",
  },
  medical: {
    label: "medical",
    defaultPlanId: "business",
    templateId: "scheduler-medical",
    templateLabel: "Medical Office Scheduler",
  },
  legal: {
    label: "legal",
    defaultPlanId: "business",
    templateId: "lead-qualifier-inbound",
    templateLabel: "Inbound Lead Qualifier",
  },
  "real-estate": {
    label: "real estate",
    defaultPlanId: "team",
    templateId: "scheduler-realestate",
    templateLabel: "Real Estate Tour Booker",
  },
  personal: {
    label: "personal",
    defaultPlanId: "personal",
    templateId: "personal-concierge",
    templateLabel: "Personal Concierge",
  },
  insurance: {
    label: "insurance",
    defaultPlanId: "business",
    templateId: "lead-qualifier-inbound",
    templateLabel: "Inbound Lead Qualifier",
  },
  restaurants: {
    label: "restaurants",
    defaultPlanId: "team",
    templateId: "ecommerce-phone-order",
    templateLabel: "Phone Order Agent",
  },
  sales: {
    label: "sales",
    defaultPlanId: "business",
    templateId: "sales-sdr",
    templateLabel: "SDR — Outbound Prospecting",
  },
};

const PLAN_SET = new Set<string>(SIGNUP_PLAN_IDS);
const WEDGE_SET = new Set<string>(SIGNUP_WEDGE_KEYS);
const LEGACY_PLAN_ALIASES: Record<string, SignupPlanId> = {
  free: "personal",
  builder: "personal",
  free_builder: "personal",
  lite: "starter",
  business_lite: "starter",
  businesslite: "starter",
  business_starter: "starter",
  businessstarter: "starter",
  plus: "team",
  starter_plus: "team",
  starterplus: "team",
  personal_plus: "team",
  personalplus: "team",
  shared: "team",
  pro: "business",
  business_starter_plus: "team",
  business_growth: "business",
  businessgrowth: "business",
  custom: "enterprise",
  scale: "enterprise",
};

function normalizePlanId(value: string | null | undefined): SignupPlanId | undefined {
  const cleaned = value?.trim().toLowerCase();
  if (!cleaned) return undefined;
  if (PLAN_SET.has(cleaned)) return cleaned as SignupPlanId;
  const aliasKey = cleaned.replace(/[-\s]+/g, "_");
  return LEGACY_PLAN_ALIASES[aliasKey] || LEGACY_PLAN_ALIASES[cleaned];
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

  const normalizedPlan = normalizePlanId(intent.preferredPlanId);
  if (normalizedPlan) out.preferredPlanId = normalizedPlan;

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

  const normalizedPlan = normalizePlanId(rawPlan);
  if (normalizedPlan) intent.preferredPlanId = normalizedPlan;

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

export function persistSignupIntent(intent: SignupIntent | null): SignupIntent | null {
  const safe = sanitizeSignupIntent(intent);
  if (typeof window === "undefined" || !safe) return null;
  try {
    window.localStorage.setItem(SIGNUP_INTENT_STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Storage can fail in private browsing; signup still works without attribution.
  }
  return safe;
}

export function captureSignupIntentFromLocation(): SignupIntent | null {
  if (typeof window === "undefined") return null;
  const fromUrl = parseSignupIntent(window.location.search);
  if (fromUrl) return persistSignupIntent(fromUrl);
  return getStoredSignupIntent();
}

export function recommendedPlanFromIntent(intent: SignupIntent | null | undefined): SignupPlanId {
  if (intent?.preferredPlanId) return intent.preferredPlanId;
  if (intent?.signupWedge) return SIGNUP_WEDGE_RECOMMENDATIONS[intent.signupWedge].defaultPlanId;
  return "personal";
}

export function getSignupWedgeRecommendation(
  wedge: string | null | undefined,
): SignupWedgeRecommendation | null {
  if (!wedge || !WEDGE_SET.has(wedge)) return null;
  return SIGNUP_WEDGE_RECOMMENDATIONS[wedge as SignupWedgeKey];
}

export function signupHrefForWedge(wedge: SignupWedgeKey, planId?: SignupPlanId): string {
  const plan = planId || SIGNUP_WEDGE_RECOMMENDATIONS[wedge].defaultPlanId;
  return `/signup?wedge=${encodeURIComponent(wedge)}&plan=${encodeURIComponent(plan)}`;
}

export async function syncSignupIntent(intent: SignupIntent | null): Promise<void> {
  if (!hasSignupIntent(intent)) return;
  const response = await fetch("/api/auth/signup-intent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(intent),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("signup intent sync failed", response.status, body.slice(0, 240));
  }
}
