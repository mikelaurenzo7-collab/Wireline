export const ACCOUNT_TERMS_VERSION = "botbound-terms-2026-10-17" as const;
export const ACCOUNT_PRIVACY_VERSION = "botbound-privacy-2026-10-17" as const;

export const ACCOUNT_TERMS_LAST_UPDATED = "October 20, 2026" as const;
export const ACCOUNT_TERMS_DESCRIPTION = `BotBound's terms of service: acceptable use, synthetic voice, billing, telemarketing compliance, messaging, privacy, and governing law. Last updated ${ACCOUNT_TERMS_LAST_UPDATED}.`;
export const ACCOUNT_PRIVACY_LAST_UPDATED = "October 20, 2026" as const;
export const ACCOUNT_PRIVACY_DESCRIPTION = `Privacy for BotBound's Bot platform: account, conversation, voice settings, billing, and measurement data. Last updated ${ACCOUNT_PRIVACY_LAST_UPDATED}.`;

export const ACCOUNT_TERMS_VERSION_HEADER = "X-BotBound-Terms-Version" as const;
export const ACCOUNT_PRIVACY_VERSION_HEADER = "X-BotBound-Privacy-Version" as const;

export const OAUTH_SIGNUP_CONSENT_REQUIRED =
  "Create your account from the sign-up page and accept the Terms and Privacy Policy." as const;

export const ACCOUNT_LEGAL_CONSENT_STATE_SUFFIX =
  `:legal:${ACCOUNT_TERMS_VERSION}:${ACCOUNT_PRIVACY_VERSION}` as const;

export type AccountLegalConsentSource =
  "email_password" | "oauth_google" | "oauth_microsoft" | "oauth_yahoo";

export type AccountLegalConsentEvidence = {
  termsVersion: typeof ACCOUNT_TERMS_VERSION;
  privacyVersion: typeof ACCOUNT_PRIVACY_VERSION;
  source: AccountLegalConsentSource;
  ipAddress?: string;
  userAgent?: string;
};

export function hasCurrentAccountLegalConsentState(value: unknown): boolean {
  return typeof value === "string" && value.endsWith(ACCOUNT_LEGAL_CONSENT_STATE_SUFFIX);
}

export function withCurrentAccountLegalConsentState(value: string): string {
  return `${value}${ACCOUNT_LEGAL_CONSENT_STATE_SUFFIX}`;
}

export function isCurrentAccountLegalConsent(
  termsAccepted: unknown,
  termsVersion: unknown,
  privacyVersion: unknown,
): boolean {
  return (
    termsAccepted === true &&
    termsVersion === ACCOUNT_TERMS_VERSION &&
    privacyVersion === ACCOUNT_PRIVACY_VERSION
  );
}
