/**
 * Browser event that keeps the texting status shown on Lines in step with the
 * Texting Registration form on the same page. Saving business details never
 * reaches carriers by itself (BotBound registers them), so "received" is its
 * own state between "needs details" and the carrier's review.
 */
export type TextingRegistrationStatus = "needs_details" | "received";

export const TEXTING_REGISTRATION_EVENT = "botbound:texting-registration";

export function isTextingRegistrationStatus(value: unknown): value is TextingRegistrationStatus {
  return value === "needs_details" || value === "received";
}

export function announceTextingRegistration(status: unknown): void {
  if (typeof window === "undefined" || !isTextingRegistrationStatus(status)) return;
  window.dispatchEvent(new CustomEvent(TEXTING_REGISTRATION_EVENT, { detail: { status } }));
}

export function textingRegistrationStatusFrom(event: Event): TextingRegistrationStatus | null {
  const status = (event as CustomEvent<{ status?: unknown }>).detail?.status;
  return isTextingRegistrationStatus(status) ? status : null;
}
