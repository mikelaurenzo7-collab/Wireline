export const SIGNUP_INTENT_STORAGE_KEY = "wireline_signup_intent_v1";

export const SIGNUP_PLAN_IDS = ["personal", "starter", "pro", "business"] as const;
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

const PLAN_SET = new Set<string>(SIGNUP_PLAN_IDS);
const WEDGE_SET = new Set<string>(SIGNUP_WEDGE_KEYS);

function cleanCampaignValue(value: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 120);
}

export function parseSignupIntent(search: string): SignupIntent | null {
  const params = new URLSearchParams(search);
  const rawPlan = params.get("plan")?.trim().toLowerCase();
  const rawWedge = params.get("wedge")?.trim().toLowerCase();

  const intent: SignupIntent = {
    capturedAt: new Date().toISOString(),
  };

  if (rawPlan && PLAN_SET.has(rawPlan)) {
    intent.preferredPlanId = rawPlan as SignupPlanId;
  }
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
    return hasSignupIntent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistSignupIntent(intent: SignupIntent | null): SignupIntent | null {
  if (typeof window === "undefined" || !hasSignupIntent(intent)) return null;
  try {
    window.localStorage.setItem(SIGNUP_INTENT_STORAGE_KEY, JSON.stringify(intent));
  } catch {
    // Storage can fail in private browsing; signup still works without attribution.
  }
  return intent;
}

export function captureSignupIntentFromLocation(): SignupIntent | null {
  if (typeof window === "undefined") return null;
  const fromUrl = parseSignupIntent(window.location.search);
  if (fromUrl) return persistSignupIntent(fromUrl);
  return getStoredSignupIntent();
}

export function recommendedPlanFromIntent(intent: SignupIntent | null | undefined): SignupPlanId {
  return intent?.preferredPlanId || "starter";
}

export async function syncSignupIntent(intent: SignupIntent | null, token: string): Promise<void> {
  if (!hasSignupIntent(intent)) return;
  await fetch("/api/auth/signup-intent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(intent),
  });
}
