/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
/**
 * Vapi phone-number provisioning.
 *
 * Wraps Vapi's number-management API into operations the app needs:
 *   - listVapiNumbers()        — what's already in the Vapi account
 *   - provisionVapiNumber()    — buy a new number (optionally area-code'd)
 *   - releaseVapiNumber()      — release back to Vapi
 *   - attachAssistantToNumber() — point a number at a specific assistant
 *
 * Vapi account limits:
 *   - First 10 vapi-managed numbers are free per account
 *   - Beyond that, ~$2/mo per number
 *   - "Free" numbers must be released to get below the cap before buying more
 *
 * Why this lives in lib/ and not in a route:
 *   The same provisioning flow is shared by explicit, deliberate callers —
 *   (1) self-serve buy via /api/phone-numbers/provision
 *   (2) admin bulk-fill via /api/admin/phone-numbers/fill-pool
 *   Signup and agent creation never auto-provision (see ARCHITECTURE.md).
 *   Keeping the Vapi side-effects in one helper means the database
 *   write + Vapi call sequencing stays consistent across callers.
 */

import { log } from "./server-context";

const VAPI_BASE = "https://api.vapi.ai";

function vapiKey(): string | null {
  return process.env.VAPI_PRIVATE_KEY || null;
}

export interface VapiPhoneNumber {
  id: string;
  number?: string | null;
  /** "vapi" for Vapi-managed, "twilio" for BYO Twilio, etc. */
  provider?: string;
  /** Display name (the Account Holder's label, not the e164 number) */
  name?: string | null;
  /** assistantId currently answering this number, if assigned */
  assistantId?: string | null;
  createdAt?: string;
}

interface RawJsonError {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

async function vapiFetch(path: string, init?: RequestInit): Promise<any> {
  const key = vapiKey();
  if (!key) {
    throw new Error("VAPI_PRIVATE_KEY is not configured — cannot reach Vapi.");
  }
  const res = await fetch(`${VAPI_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await res.text();
  let parsed: any = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    /* leave parsed null */
  }

  if (!res.ok) {
    const err = (parsed as RawJsonError) || {};
    const msg = Array.isArray(err.message) ? err.message.join("; ") : err.message;
    throw new Error(`Vapi ${res.status}: ${msg || err.error || body.slice(0, 200)}`);
  }
  return parsed;
}

/** List every phone number in the Vapi account (account-wide, not per user). */
export async function listVapiNumbers(): Promise<VapiPhoneNumber[]> {
  const data = await vapiFetch("/phone-number");
  if (!Array.isArray(data)) return [];
  return data.map((n: any) => ({
    id: n.id,
    number: n.number ?? null,
    provider: n.provider,
    name: n.name ?? null,
    assistantId: n.assistantId ?? null,
    createdAt: n.createdAt,
  }));
}

/**
 * Provision a new Vapi-managed number. Optionally pinned to a specific
 * area code (Vapi will pick a random local number within that area code).
 * Returns the newly-provisioned number.
 *
 * Throws on Vapi-side rejection (out of inventory, cap exceeded, etc.).
 */
/** Import a number already owned on Wireline's Twilio account into Vapi for voice. */
export async function importTwilioNumberToVapi(opts: {
  number: string;
  name?: string;
  /** When false, Wireline keeps Twilio SMS webhooks (TCPA opt-out on /api/twilio-webhook/sms). */
  smsEnabled?: boolean;
  assistantId?: string;
}): Promise<VapiPhoneNumber> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error(
      "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required to import numbers into Vapi.",
    );
  }

  const payload: Record<string, unknown> = {
    provider: "twilio",
    number: opts.number,
    twilioAccountSid: accountSid,
    twilioAuthToken: authToken,
    name: opts.name || "Wireline-managed",
    smsEnabled: opts.smsEnabled === true,
  };
  if (opts.assistantId) {
    payload.assistantId = opts.assistantId;
  }

  const created = await vapiFetch("/phone-number", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    id: created.id,
    number: created.number ?? opts.number,
    provider: created.provider,
    name: created.name ?? null,
    assistantId: created.assistantId ?? null,
    createdAt: created.createdAt,
  };
}

export async function provisionVapiNumber(opts: {
  /** US area code (e.g. "415", "617"). Omit for any-area-code. */
  areaCode?: string;
  /** Optional human label (visible only in Vapi dashboard). */
  name?: string;
  /** Optional assistant to assign to the number at create-time. */
  assistantId?: string;
  smsEnabled?: boolean;
}): Promise<VapiPhoneNumber> {
  const payload: Record<string, any> = {
    provider: "vapi",
    name: opts.name || "Wireline-managed",
  };
  if (opts.areaCode && /^\d{3}$/.test(opts.areaCode)) {
    payload.numberDesiredAreaCode = opts.areaCode;
  }
  if (opts.assistantId) {
    payload.assistantId = opts.assistantId;
  }
  if (opts.smsEnabled === true) {
    payload.smsEnabled = true;
  }

  const created = await vapiFetch("/phone-number", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return {
    id: created.id,
    number: created.number ?? null,
    provider: created.provider,
    name: created.name ?? null,
    assistantId: created.assistantId ?? null,
    createdAt: created.createdAt,
  };
}

/** Release a phone number back to Vapi (frees a slot). */
export async function releaseVapiNumber(vapiNumberId: string): Promise<void> {
  await vapiFetch(`/phone-number/${vapiNumberId}`, { method: "DELETE" });
}

/** Point an existing phone number at a specific assistant. */
export async function attachAssistantToNumber(
  vapiNumberId: string,
  assistantId: string,
): Promise<void> {
  await vapiFetch(`/phone-number/${vapiNumberId}`, {
    method: "PATCH",
    body: JSON.stringify({ assistantId }),
  });
}

/**
 * Account-level free-tier headroom. Vapi gives every account 10 free
 * vapi-managed numbers — past that, each one is billable monthly. We
 * use this to gate auto-provisioning so we never accidentally bill the
 * Account Holder just because they hit signup.
 */
export const VAPI_FREE_NUMBER_CAP = 10;

export async function vapiAccountHeadroom(): Promise<{
  used: number;
  cap: number;
  remaining: number;
}> {
  try {
    const numbers = await listVapiNumbers();
    const vapiManaged = numbers.filter((n) => n.provider === "vapi").length;
    return {
      used: vapiManaged,
      cap: VAPI_FREE_NUMBER_CAP,
      remaining: Math.max(0, VAPI_FREE_NUMBER_CAP - vapiManaged),
    };
  } catch (e: any) {
    log.warn("vapiAccountHeadroom probe failed", { error: e?.message });
    return { used: 0, cap: VAPI_FREE_NUMBER_CAP, remaining: 0 };
  }
}

/**
 * Curated list of US area codes for the Account Holder-facing picker. We
 * keep this short so the UI stays fast — Vapi has inventory for most
 * but a dropdown of 300+ NANPA codes is unusable. Account Holders who need
 * something exotic can pass `areaCode` directly via API.
 */
export const POPULAR_AREA_CODES: ReadonlyArray<{
  code: string;
  city: string;
  state: string;
}> = [
  // East coast
  { code: "212", city: "New York", state: "NY" },
  { code: "646", city: "New York", state: "NY" },
  { code: "718", city: "New York", state: "NY" },
  { code: "917", city: "New York", state: "NY" },
  { code: "202", city: "Washington", state: "DC" },
  { code: "617", city: "Boston", state: "MA" },
  { code: "857", city: "Boston", state: "MA" },
  { code: "215", city: "Philadelphia", state: "PA" },
  { code: "305", city: "Miami", state: "FL" },
  { code: "404", city: "Atlanta", state: "GA" },
  // Midwest
  { code: "312", city: "Chicago", state: "IL" },
  { code: "773", city: "Chicago", state: "IL" },
  { code: "414", city: "Milwaukee", state: "WI" },
  { code: "216", city: "Cleveland", state: "OH" },
  { code: "313", city: "Detroit", state: "MI" },
  { code: "612", city: "Minneapolis", state: "MN" },
  { code: "314", city: "St. Louis", state: "MO" },
  // South
  { code: "512", city: "Austin", state: "TX" },
  { code: "214", city: "Dallas", state: "TX" },
  { code: "713", city: "Houston", state: "TX" },
  { code: "615", city: "Nashville", state: "TN" },
  { code: "704", city: "Charlotte", state: "NC" },
  { code: "919", city: "Raleigh", state: "NC" },
  // West coast
  { code: "415", city: "San Francisco", state: "CA" },
  { code: "628", city: "San Francisco", state: "CA" },
  { code: "213", city: "Los Angeles", state: "CA" },
  { code: "310", city: "Los Angeles", state: "CA" },
  { code: "323", city: "Los Angeles", state: "CA" },
  { code: "424", city: "Los Angeles", state: "CA" },
  { code: "619", city: "San Diego", state: "CA" },
  { code: "206", city: "Seattle", state: "WA" },
  { code: "425", city: "Seattle", state: "WA" },
  { code: "503", city: "Portland", state: "OR" },
  { code: "702", city: "Las Vegas", state: "NV" },
  { code: "303", city: "Denver", state: "CO" },
  { code: "602", city: "Phoenix", state: "AZ" },
  // Wireline's neighborhood
  { code: "630", city: "Chicago Suburbs", state: "IL" },
  { code: "847", city: "Chicago Suburbs", state: "IL" },
];
