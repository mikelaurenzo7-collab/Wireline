import type { LiveExternalActionPolicy } from "../account-environment-policy";
import { AppError } from "../api-error";

export type PhoneNumberPickerRow = {
  phone_number: string;
  area_code: string | null;
  region: string | null;
};

export type PhoneNumberPickerInventory = {
  available: PhoneNumberPickerRow[];
  source: "demo_fixture" | "twilio_preview";
};

export type PhoneNumberAreaCode = {
  code: string;
  city: string;
  state: string;
};

/**
 * Static popular US area codes for the Calls picker chips. This is a catalog,
 * not carrier inventory: search and provision still go through the live
 * Twilio fences. Keep the demo fixture area codes in this list so showcase
 * chips match the reserved numbers already shown.
 */
export const POPULAR_US_AREA_CODES: readonly PhoneNumberAreaCode[] = Object.freeze([
  { code: "202", city: "Washington", state: "DC" },
  { code: "212", city: "New York", state: "NY" },
  { code: "312", city: "Chicago", state: "IL" },
  { code: "415", city: "San Francisco", state: "CA" },
  { code: "617", city: "Boston", state: "MA" },
  { code: "206", city: "Seattle", state: "WA" },
  { code: "305", city: "Miami", state: "FL" },
  { code: "404", city: "Atlanta", state: "GA" },
  { code: "713", city: "Houston", state: "TX" },
  { code: "310", city: "Los Angeles", state: "CA" },
  { code: "303", city: "Denver", state: "CO" },
  { code: "702", city: "Las Vegas", state: "NV" },
]);

export function listPhoneNumberPickerAreaCodes(): PhoneNumberAreaCode[] {
  return POPULAR_US_AREA_CODES.map((row) => ({ ...row }));
}

/**
 * Static NANP-reserved 555-01xx inventory for the dedicated demo workspace.
 * These numbers are deliberately inert: they make the picker visually useful
 * without asking a carrier for inventory or exposing a potentially routable
 * number in screenshots.
 */
export const DEMO_PHONE_NUMBER_INVENTORY: readonly PhoneNumberPickerRow[] = Object.freeze([
  { phone_number: "+12025550140", area_code: "202", region: "Washington, DC" },
  { phone_number: "+12125550141", area_code: "212", region: "New York, NY" },
  { phone_number: "+13125550142", area_code: "312", region: "Chicago, IL" },
  { phone_number: "+14155550143", area_code: "415", region: "San Francisco, CA" },
  { phone_number: "+16175550144", area_code: "617", region: "Boston, MA" },
  { phone_number: "+12065550145", area_code: "206", region: "Seattle, WA" },
  { phone_number: "+13055550146", area_code: "305", region: "Miami, FL" },
  { phone_number: "+14045550147", area_code: "404", region: "Atlanta, GA" },
]);

function policyError(policy: Exclude<LiveExternalActionPolicy, { allowed: true }>): AppError {
  return new AppError(policy.status, policy.code, policy.message);
}

/**
 * Resolve the pre-provider branch for the number picker. Production returns
 * null and continues through the existing rate-limited carrier path. Demo
 * returns before that limiter or any carrier client is reached. Every other
 * classification fails closed.
 */
export function resolveNonProductionPhoneNumberPickerInventory(
  policy: LiveExternalActionPolicy,
): PhoneNumberPickerInventory | null {
  if (policy.allowed) return null;
  if (policy.environment === "demo") {
    return {
      available: DEMO_PHONE_NUMBER_INVENTORY.map((row) => ({ ...row })),
      source: "demo_fixture",
    };
  }
  throw policyError(policy);
}
