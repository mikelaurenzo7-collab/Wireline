/**
 * Seller National Do Not Call Registry subscription rules.
 *
 * The FTC Telemarketing Sales Rule requires every seller that places marketing
 * calls to hold its own registry subscription account number (SAN) covering
 * each area code it calls. A service provider such as BotBound may screen only
 * with the seller's own subscription and only for that seller. Sharing one
 * platform subscription across customers is prohibited.
 *
 * Pure and dependency-free so the server gate, the API and the Compliance
 * Center share one definition.
 */

export const DNC_REGISTRY_URL = "https://telemarketing.donotcall.gov";

/** Registry subscriptions run 12 months; allow a small renewal-date margin. */
const MAX_TERM_DAYS = 400;
const MAX_AREA_CODES = 400;
const SAN_RE = /^[A-Za-z0-9-]{6,20}$/;
const AREA_CODE_RE = /^[2-9]\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VENDOR_PROJECT_RE = /^[A-Za-z0-9_-]{1,64}$/;

export type DncSellerRegistration = {
  /** The seller's own subscription account number from the FTC. */
  san: string;
  /** Legal name the subscription is registered under. */
  seller_name: string;
  /** Area codes the subscription covers, or "all" for the nationwide list. */
  area_codes: string[] | "all";
  /** Last day of the current subscription term (YYYY-MM-DD). */
  expires_on: string;
  /** When the owner attested the SAN is theirs and authorized screening with it. */
  attested_at: string;
  attested_by: string;
  /** Screening vendor project configured with this SAN, set by a platform admin. */
  vendor_project_id: string | null;
  vendor_linked_at: string | null;
};

export type DncSellerRegistrationState = "missing" | "pending_link" | "expired" | "active";

export type DncSellerGateDenial = {
  allowed: false;
  code:
    | "SELLER_DNC_REGISTRATION_REQUIRED"
    | "SELLER_DNC_REGISTRATION_PENDING"
    | "SELLER_DNC_REGISTRATION_EXPIRED"
    | "SELLER_DNC_AREA_CODE_NOT_COVERED";
  message: string;
};

export type DncSellerGateResult = { allowed: true; vendorProjectId: string } | DncSellerGateDenial;

export type DncSellerRegistrationInput = {
  san?: unknown;
  seller_name?: unknown;
  area_codes?: unknown;
  expires_on?: unknown;
  attest?: unknown;
};

function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000,
  );
}

/** Accepts "all", an array of codes, or a comma/space separated string. */
export function parseAreaCodes(value: unknown): string[] | "all" | null {
  if (typeof value === "string" && value.trim().toLowerCase() === "all") return "all";
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,;]+/)
      : null;
  if (!raw) return null;
  const codes = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const code = item.trim();
    if (!code) continue;
    if (!AREA_CODE_RE.test(code)) return null;
    codes.add(code);
  }
  if (codes.size === 0 || codes.size > MAX_AREA_CODES) return null;
  return [...codes].sort();
}

/** Validate the owner's submission. Never accepts a vendor link from the owner. */
export function parseDncSellerRegistrationInput(
  input: DncSellerRegistrationInput,
  now = new Date(),
):
  | {
      ok: true;
      value: Pick<DncSellerRegistration, "san" | "seller_name" | "area_codes" | "expires_on">;
    }
  | { ok: false; error: string } {
  const san = typeof input.san === "string" ? input.san.trim().toUpperCase() : "";
  if (!SAN_RE.test(san))
    return {
      ok: false,
      error: "Enter the subscription account number (SAN) from your registry account.",
    };
  const sellerName = typeof input.seller_name === "string" ? input.seller_name.trim() : "";
  if (sellerName.length < 2 || sellerName.length > 200)
    return {
      ok: false,
      error: "Enter the legal business name the subscription is registered under.",
    };
  const areaCodes = parseAreaCodes(input.area_codes);
  if (!areaCodes)
    return {
      ok: false,
      error: 'List the 3-digit area codes your subscription covers, or enter "all".',
    };
  const expiresOn = typeof input.expires_on === "string" ? input.expires_on.trim() : "";
  if (!isRealDate(expiresOn))
    return { ok: false, error: "Enter the subscription expiration date." };
  const today = todayUtc(now);
  if (expiresOn < today)
    return { ok: false, error: "That subscription has already expired. Renew it first." };
  if (daysBetween(today, expiresOn) > MAX_TERM_DAYS)
    return {
      ok: false,
      error: "Registry subscriptions last 12 months. Check the expiration date.",
    };
  if (input.attest !== true)
    return {
      ok: false,
      error:
        "Confirm the subscription belongs to your business and authorize BotBound to screen with it.",
    };
  return {
    ok: true,
    value: { san, seller_name: sellerName, area_codes: areaCodes, expires_on: expiresOn },
  };
}

export function isValidVendorProjectId(value: unknown): value is string {
  return typeof value === "string" && VENDOR_PROJECT_RE.test(value);
}

/** Tolerant read of the stored jsonb; anything malformed is treated as missing. */
export function readStoredDncSellerRegistration(value: unknown): DncSellerRegistration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const areaCodes = parseAreaCodes(v.area_codes);
  if (
    typeof v.san !== "string" ||
    !SAN_RE.test(v.san) ||
    typeof v.seller_name !== "string" ||
    !areaCodes ||
    typeof v.expires_on !== "string" ||
    !isRealDate(v.expires_on) ||
    typeof v.attested_at !== "string" ||
    typeof v.attested_by !== "string"
  )
    return null;
  return {
    san: v.san,
    seller_name: v.seller_name,
    area_codes: areaCodes,
    expires_on: v.expires_on,
    attested_at: v.attested_at,
    attested_by: v.attested_by,
    vendor_project_id: isValidVendorProjectId(v.vendor_project_id) ? v.vendor_project_id : null,
    vendor_linked_at: typeof v.vendor_linked_at === "string" ? v.vendor_linked_at : null,
  };
}

export function dncSellerRegistrationState(
  registration: DncSellerRegistration | null,
  now = new Date(),
): DncSellerRegistrationState {
  if (!registration) return "missing";
  if (registration.expires_on < todayUtc(now)) return "expired";
  if (!registration.vendor_project_id) return "pending_link";
  return "active";
}

/** US area code of a NANP number, or null for anything else. */
export function usAreaCode(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return null;
  const area = ten.slice(0, 3);
  return AREA_CODE_RE.test(area) ? area : null;
}

/** Marketing calls need an active seller subscription that covers the number's area code. */
export function evaluateDncSellerRegistration(
  registration: DncSellerRegistration | null,
  phone: string,
  now = new Date(),
): DncSellerGateResult {
  const state = dncSellerRegistrationState(registration, now);
  if (state === "missing" || !registration)
    return {
      allowed: false,
      code: "SELLER_DNC_REGISTRATION_REQUIRED",
      message:
        "Add your National Do Not Call Registry subscription in Compliance before marketing calls or texts can run.",
    };
  if (state === "expired")
    return {
      allowed: false,
      code: "SELLER_DNC_REGISTRATION_EXPIRED",
      message:
        "Your Do Not Call Registry subscription has expired. Renew it, then update the expiration date in Compliance.",
    };
  if (state === "pending_link" || !registration.vendor_project_id)
    return {
      allowed: false,
      code: "SELLER_DNC_REGISTRATION_PENDING",
      message:
        "BotBound is still connecting screening to your Do Not Call Registry subscription. Marketing calls and texts stay paused until it is connected.",
    };
  const area = usAreaCode(phone);
  if (!area || (registration.area_codes !== "all" && !registration.area_codes.includes(area)))
    return {
      allowed: false,
      code: "SELLER_DNC_AREA_CODE_NOT_COVERED",
      message: area
        ? `Your Do Not Call Registry subscription doesn't cover area code ${area}. Add it to your subscription, then update Compliance.`
        : "Marketing calls and texts are limited to US numbers covered by your Do Not Call Registry subscription.",
    };
  return { allowed: true, vendorProjectId: registration.vendor_project_id };
}
