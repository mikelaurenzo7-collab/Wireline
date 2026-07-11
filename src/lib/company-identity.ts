export const COMPANY_IDENTITY_VERSION = 1 as const;

export const COMPANY_IDENTITY_CHANNELS = ["voice", "sms", "email"] as const;
export type CompanyIdentityChannel = (typeof COMPANY_IDENTITY_CHANNELS)[number];

export const COMPANY_IDENTITY_PROVIDER_STATUSES = [
  "not_requested",
  "review_requested",
  "in_review",
  "approved",
  "rejected",
  "limited",
] as const;
export type CompanyIdentityProviderStatus =
  (typeof COMPANY_IDENTITY_PROVIDER_STATUSES)[number];

export type CompanyIdentityPreferences = {
  version: typeof COMPANY_IDENTITY_VERSION;
  callerIdName: string | null;
  website: string | null;
  supportEmail: string | null;
  defaultCallReason: string | null;
  requestedChannels: CompanyIdentityChannel[];
  reviewRequestedAt: string | null;
  reviewFingerprint: string | null;
  providerStatus: Record<CompanyIdentityChannel, CompanyIdentityProviderStatus>;
};

export type CompanyIdentityProfile = {
  businessName: string | null;
  brandName: string | null;
  logoUrl: string | null;
  callerIdName: string | null;
  website: string | null;
  supportEmail: string | null;
  defaultCallReason: string | null;
  requestedChannels: CompanyIdentityChannel[];
  reviewRequestedAt: string | null;
  reviewFingerprint: string | null;
  providerStatus: Record<CompanyIdentityChannel, CompanyIdentityProviderStatus>;
};

export type CompanyIdentityChannelReadiness = {
  channel: CompanyIdentityChannel;
  profileStatus: "incomplete" | "ready";
  providerStatus: CompanyIdentityProviderStatus;
  missing: string[];
  displayScope: string;
};

const DEFAULT_PROVIDER_STATUS: Record<CompanyIdentityChannel, CompanyIdentityProviderStatus> = {
  voice: "not_requested",
  sms: "not_requested",
  email: "not_requested",
};

export function defaultCompanyIdentityPreferences(): CompanyIdentityPreferences {
  return {
    version: COMPANY_IDENTITY_VERSION,
    callerIdName: null,
    website: null,
    supportEmail: null,
    defaultCallReason: null,
    requestedChannels: [...COMPANY_IDENTITY_CHANNELS],
    reviewRequestedAt: null,
    reviewFingerprint: null,
    providerStatus: { ...DEFAULT_PROVIDER_STATUS },
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function providerStatus(value: unknown): CompanyIdentityProviderStatus {
  return COMPANY_IDENTITY_PROVIDER_STATUSES.includes(value as CompanyIdentityProviderStatus)
    ? (value as CompanyIdentityProviderStatus)
    : "not_requested";
}

export function readCompanyIdentityPreferences(value: unknown): CompanyIdentityPreferences {
  const defaults = defaultCompanyIdentityPreferences();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Record<string, unknown>;
  const rawProviderStatus =
    raw.providerStatus && typeof raw.providerStatus === "object" && !Array.isArray(raw.providerStatus)
      ? (raw.providerStatus as Record<string, unknown>)
      : {};
  const requestedChannels = Array.isArray(raw.requestedChannels)
    ? raw.requestedChannels.filter((channel): channel is CompanyIdentityChannel =>
        COMPANY_IDENTITY_CHANNELS.includes(channel as CompanyIdentityChannel),
      )
    : defaults.requestedChannels;

  return {
    version: COMPANY_IDENTITY_VERSION,
    callerIdName: nullableString(raw.callerIdName),
    website: nullableString(raw.website),
    supportEmail: nullableString(raw.supportEmail),
    defaultCallReason: nullableString(raw.defaultCallReason),
    requestedChannels: requestedChannels.length ? requestedChannels : defaults.requestedChannels,
    reviewRequestedAt: nullableString(raw.reviewRequestedAt),
    reviewFingerprint: nullableString(raw.reviewFingerprint),
    providerStatus: {
      voice: providerStatus(rawProviderStatus.voice),
      sms: providerStatus(rawProviderStatus.sms),
      email: providerStatus(rawProviderStatus.email),
    },
  };
}

export function buildCompanyIdentityProfile(args: {
  settings?: {
    businessName?: string | null;
    brandName?: string | null;
    brandLogoUrl?: string | null;
  } | null;
  preferences: CompanyIdentityPreferences;
}): CompanyIdentityProfile {
  return {
    businessName: nullableString(args.settings?.businessName),
    brandName: nullableString(args.settings?.brandName) ?? nullableString(args.settings?.businessName),
    logoUrl: nullableString(args.settings?.brandLogoUrl),
    callerIdName: args.preferences.callerIdName,
    website: args.preferences.website,
    supportEmail: args.preferences.supportEmail,
    defaultCallReason: args.preferences.defaultCallReason,
    requestedChannels: args.preferences.requestedChannels,
    reviewRequestedAt: args.preferences.reviewRequestedAt,
    reviewFingerprint: args.preferences.reviewFingerprint,
    providerStatus: args.preferences.providerStatus,
  };
}

export function companyIdentityFingerprint(value: {
  businessName: string | null;
  brandName: string | null;
  logoUrl: string | null;
  callerIdName: string | null;
  website: string | null;
  supportEmail: string | null;
  defaultCallReason: string | null;
  requestedChannels: CompanyIdentityChannel[];
}): string {
  return JSON.stringify({
    businessName: nullableString(value.businessName),
    brandName: nullableString(value.brandName),
    logoUrl: nullableString(value.logoUrl),
    callerIdName: nullableString(value.callerIdName),
    website: nullableString(value.website),
    supportEmail: nullableString(value.supportEmail)?.toLowerCase() ?? null,
    defaultCallReason: nullableString(value.defaultCallReason),
    requestedChannels: [...value.requestedChannels].sort(),
  });
}

function supportEmailMatchesWebsite(website: string | null, supportEmail: string | null): boolean {
  if (!website || !supportEmail) return false;
  try {
    const websiteHost = new URL(website).hostname.toLowerCase().replace(/^www\./, "");
    const emailDomain = supportEmail.split("@")[1]?.toLowerCase().replace(/^www\./, "");
    if (!emailDomain) return false;
    return (
      websiteHost === emailDomain ||
      websiteHost.endsWith(`.${emailDomain}`) ||
      emailDomain.endsWith(`.${websiteHost}`)
    );
  } catch {
    return false;
  }
}

export function buildCompanyIdentityReadiness(args: {
  profile: CompanyIdentityProfile;
  phoneNumber?: string | null;
}): Record<CompanyIdentityChannel, CompanyIdentityChannelReadiness> {
  const hasNumber = Boolean(nullableString(args.phoneNumber));
  const hasName = Boolean(args.profile.brandName || args.profile.businessName);
  const hasWebsite = Boolean(args.profile.website);
  const hasSupportEmail = Boolean(args.profile.supportEmail);
  const hasBrandedSupportEmail = supportEmailMatchesWebsite(
    args.profile.website,
    args.profile.supportEmail,
  );
  const hasCallerIdName = Boolean(args.profile.callerIdName);

  const voiceMissing = [
    !hasNumber ? "dedicated Wireline number" : null,
    !hasName ? "company display name" : null,
    !hasCallerIdName ? "15-character caller ID fallback name" : null,
    !hasWebsite ? "company website" : null,
  ].filter((value): value is string => Boolean(value));

  const smsMissing = [
    !hasNumber ? "dedicated Wireline number" : null,
    !hasName ? "company display name" : null,
    !hasWebsite ? "company website" : null,
    !hasSupportEmail ? "support email" : null,
  ].filter((value): value is string => Boolean(value));

  const emailMissing = [
    !hasName ? "company display name" : null,
    !hasWebsite ? "company website" : null,
    !hasBrandedSupportEmail ? "support email on the company domain" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    voice: {
      channel: "voice",
      profileStatus: voiceMissing.length ? "incomplete" : "ready",
      providerStatus: args.profile.providerStatus.voice,
      missing: voiceMissing,
      displayScope:
        "Verified display name may appear on supported mobile networks. Enhanced logo and call reason require carrier support; CNAM is the landline fallback.",
    },
    sms: {
      channel: "sms",
      profileStatus: smsMissing.length ? "incomplete" : "ready",
      providerStatus: args.profile.providerStatus.sms,
      missing: smsMissing,
      displayScope:
        "US application-to-person messaging requires business and campaign registration before production traffic.",
    },
    email: {
      channel: "email",
      profileStatus: emailMissing.length ? "incomplete" : "ready",
      providerStatus: args.profile.providerStatus.email,
      missing: emailMissing,
      displayScope:
        "Branded email requires an authenticated sending domain; inbox display remains controlled by the recipient's email provider.",
    },
  };
}

export function canRequestCompanyIdentityReview(args: {
  readiness: Record<CompanyIdentityChannel, CompanyIdentityChannelReadiness>;
  requestedChannels: CompanyIdentityChannel[];
}): boolean {
  return (
    args.requestedChannels.length > 0 &&
    args.requestedChannels.every((channel) => args.readiness[channel].profileStatus === "ready")
  );
}
