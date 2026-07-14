export const E164_PHONE_PATTERN = /^\+[1-9]\d{1,14}$/;
export const TWILIO_MESSAGING_SERVICE_PATTERN = /^MG[a-fA-F0-9]{32}$/;

/**
 * Clone a JSON settings object without converting malformed request bodies
 * into an empty, valid settings update. Returning undefined lets the canonical
 * SettingsSchema reject arrays, primitives, and null payloads downstream.
 */
export function copyTwilioSettingsRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return { ...(value as Record<string, unknown>) };
}

/**
 * Normalize tenant-managed Twilio destinations before they can reach provider
 * APIs or be interpolated into TwiML. Empty form fields are stored as null.
 */
export function normalizeTwilioPhoneSetting(
  value: unknown,
  fieldLabel: string,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new TypeError(`${fieldLabel} must be text.`);

  const normalized = value.trim().replace(/^whatsapp:\s*/i, "");
  if (!normalized) return null;

  // Accept the visual separators people naturally paste from carrier tools,
  // while storage and provider calls always receive strict E.164. Deliberately
  // remove only separators; letters, markup, and every other character fail.
  const compact = normalized.replace(/[\s().-]/g, "");
  if (!E164_PHONE_PATTERN.test(compact)) {
    throw new TypeError(`${fieldLabel} must be an E.164 number, for example +14155550123.`);
  }
  return compact;
}

export function normalizeTwilioMessagingServiceSid(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new TypeError("Twilio Messaging Service SID must be text.");

  const normalized = value.trim();
  if (!normalized) return null;
  if (!TWILIO_MESSAGING_SERVICE_PATTERN.test(normalized)) {
    throw new TypeError(
      "Twilio Messaging Service SID must start with MG and contain 32 hex characters.",
    );
  }
  return normalized;
}
