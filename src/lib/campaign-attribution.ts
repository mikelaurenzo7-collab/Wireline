export const CAMPAIGN_ATTRIBUTION_FIELDS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

export type CampaignAttribution = Partial<
  Record<(typeof CAMPAIGN_ATTRIBUTION_FIELDS)[number], string>
>;

/** Keep campaign labels bounded and single-line, rejecting email-like values. */
export function cleanCampaignAttribution(value: unknown): CampaignAttribution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const input = value as Record<string, unknown>;
  const attribution: CampaignAttribution = {};
  for (const field of CAMPAIGN_ATTRIBUTION_FIELDS) {
    const raw = input[field];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (/^[a-z0-9._~-]{1,120}$/i.test(trimmed)) attribution[field] = trimmed;
  }
  return attribution;
}

export function campaignAttributionFromSearchParams(params: URLSearchParams): CampaignAttribution {
  return cleanCampaignAttribution(
    Object.fromEntries(CAMPAIGN_ATTRIBUTION_FIELDS.map((field) => [field, params.get(field)])),
  );
}

export function campaignAttributionLines(value: unknown): string[] {
  const attribution = cleanCampaignAttribution(value);
  return CAMPAIGN_ATTRIBUTION_FIELDS.flatMap((field) =>
    attribution[field] ? [field + ": " + attribution[field]] : [],
  );
}
