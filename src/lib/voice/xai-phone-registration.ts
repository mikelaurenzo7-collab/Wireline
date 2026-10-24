import { randomBytes } from "node:crypto";
import { eq, isNotNull, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { decryptSecret, encryptSecret } from "../secret-vault";
import { drizzle, fetchWithTimeout, log, tenantStore } from "../server-context";
import { XAI_PHONE_NUMBERS_URL, xaiSipConfigured, xaiSipWebhookUrl } from "./xai-sip-config";

const XAI_REQUEST_TIMEOUT_MS = 20_000;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export type XAISipCredentials = { username: string; password: string };

export type XAIRegistrationResult =
  | { phoneNumber: string; status: "registered" | "already_registered" }
  | { phoneNumber: string; status: "failed"; reason: string };

function xaiApiKey(): string {
  const key = String(process.env.XAI_API_KEY || "").trim();
  if (!key) throw new Error("XAI_API_KEY is not configured.");
  return key;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Registrations are platform secrets: never read inside a tenant's database
 * scope. Drizzle queries are lazy thenables, so the query must be awaited
 * inside the exit scope; returning the builder would run it after the tenant
 * scope is restored.
 */
function outsideTenant<T>(operation: () => PromiseLike<T>): Promise<T> {
  return tenantStore.exit(async () => await operation());
}

async function findRegistration(phoneNumber: string) {
  const [row] = await outsideTenant(() =>
    drizzle
      .select()
      .from(schema.xaiPhoneRegistrations)
      .where(eq(schema.xaiPhoneRegistrations.phoneNumber, phoneNumber))
      .limit(1),
  );
  return row ?? null;
}

export async function isXAIPhoneRegistered(phoneNumber: string): Promise<boolean> {
  return Boolean(await findRegistration(phoneNumber));
}

/** Digest credentials Twilio presents to xAI for this number, or null if unregistered. */
export async function xaiSipCredentialsFor(phoneNumber: string): Promise<XAISipCredentials | null> {
  const row = await findRegistration(phoneNumber);
  if (!row) return null;
  return { username: row.sipUsername, password: decryptSecret(row.sipPasswordEncrypted) };
}

/** The webhook signing secret xAI issued for this number, or null if unregistered. */
export async function xaiWebhookSecretFor(phoneNumber: string): Promise<string | null> {
  const row = await findRegistration(phoneNumber);
  return row ? decryptSecret(row.webhookSecretEncrypted) : null;
}

/** Exact xAI BYO-trunk registration body: digest auth and a signed webhook. */
export function buildXAIPhoneRegistrationBody(input: {
  phoneNumber: string;
  webhookUrl: string;
  credentials: XAISipCredentials;
}) {
  return {
    origin: "byo_trunk" as const,
    name: `BotBound ${input.phoneNumber}`,
    phone_number: input.phoneNumber,
    sip_auth: {
      auth_username: input.credentials.username,
      auth_password: input.credentials.password,
    },
    webhook: {
      name: `BotBound voice ${input.phoneNumber}`,
      url: input.webhookUrl,
    },
  };
}

export function parseXAIPhoneRegistration(payload: unknown) {
  const body = asRecord(payload);
  const phone = asRecord(body.phone_number);
  const webhook = asRecord(body.webhook);
  const xaiPhoneNumberId = stringField(phone.phone_number_id) || stringField(body.phone_number_id);
  const xaiWebhookId =
    stringField(webhook.webhook_id) ||
    stringField(phone.webhook_id) ||
    stringField(body.webhook_id);
  const signingSecret =
    stringField(webhook.dispatch_signing_secret) || stringField(body.dispatch_signing_secret);
  if (!xaiPhoneNumberId || !xaiWebhookId || !signingSecret) {
    throw new Error("xAI registration response was missing its ids or signing secret.");
  }
  return { xaiPhoneNumberId, xaiWebhookId, signingSecret };
}

function newSipCredentials(): XAISipCredentials {
  return {
    username: `bb${randomBytes(10).toString("hex")}`,
    password: randomBytes(24).toString("base64url"),
  };
}

type ListedXAIPhoneNumber = { id: string; phoneNumber: string; createdAtMs: number | null };

/** A registration younger than this is never treated as stale: another process may own it. */
export const XAI_REGISTRATION_MIN_STALE_AGE_MS = 60_000;

function createdAtMs(record: Record<string, unknown>): number | null {
  for (const key of ["created_at", "create_time", "createdAt", "created"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value))
      return value < 1e12 ? value * 1000 : value;
    if (typeof value === "string" && value) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * On a 409/400, only registrations at least 60 s old may be replaced. One
 * without a creation time is replaced only when BotBound holds no row for the
 * number (checked under the registration lock by the caller).
 */
export function staleXAIRegistrations(
  rows: ListedXAIPhoneNumber[],
  phoneNumber: string,
  now: number = Date.now(),
): ListedXAIPhoneNumber[] {
  return rows.filter(
    (row) =>
      row.phoneNumber === phoneNumber &&
      (row.createdAtMs === null || now - row.createdAtMs >= XAI_REGISTRATION_MIN_STALE_AGE_MS),
  );
}

async function listXAIPhoneNumbers(): Promise<ListedXAIPhoneNumber[]> {
  const found: ListedXAIPhoneNumber[] = [];
  let token = "";
  for (let page = 0; page < 20; page += 1) {
    const url = new URL(XAI_PHONE_NUMBERS_URL);
    url.searchParams.set("limit", "100");
    if (token) url.searchParams.set("pagination_token", token);
    const response = await fetchWithTimeout(
      url.toString(),
      { headers: { Authorization: `Bearer ${xaiApiKey()}` } },
      XAI_REQUEST_TIMEOUT_MS,
    );
    if (!response.ok) throw new Error(`xAI phone number list returned HTTP ${response.status}.`);
    const body = asRecord(await response.json());
    const rows = Array.isArray(body.phone_numbers) ? body.phone_numbers : [];
    for (const row of rows) {
      const record = asRecord(row);
      const id = stringField(record.phone_number_id);
      const phoneNumber = stringField(record.phone_number);
      if (id && phoneNumber) found.push({ id, phoneNumber, createdAtMs: createdAtMs(record) });
    }
    token = stringField(body.pagination_token);
    if (!token) break;
  }
  return found;
}

async function deleteXAIPhoneNumber(xaiPhoneNumberId: string): Promise<void> {
  const response = await fetchWithTimeout(
    `${XAI_PHONE_NUMBERS_URL}/${encodeURIComponent(xaiPhoneNumberId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${xaiApiKey()}` } },
    XAI_REQUEST_TIMEOUT_MS,
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`xAI phone number removal returned HTTP ${response.status}.`);
  }
}

async function createXAIRegistration(phoneNumber: string, credentials: XAISipCredentials) {
  return fetchWithTimeout(
    XAI_PHONE_NUMBERS_URL,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${xaiApiKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        buildXAIPhoneRegistrationBody({ phoneNumber, webhookUrl: xaiSipWebhookUrl(), credentials }),
      ),
    },
    XAI_REQUEST_TIMEOUT_MS,
  );
}

/**
 * Register one BotBound number with xAI. Idempotent per number: an existing
 * BotBound registration is kept. A stale xAI-side registration that BotBound
 * holds no secret for (for example from the earlier xAI era) is replaced,
 * because its one-time signing secret cannot be recovered.
 */
export async function registerXAIPhoneNumber(
  rawPhoneNumber: string,
): Promise<XAIRegistrationResult> {
  const phoneNumber = rawPhoneNumber.trim();
  if (!E164_PATTERN.test(phoneNumber)) {
    return { phoneNumber, status: "failed", reason: "invalid_number" };
  }
  if (!xaiSipConfigured()) return { phoneNumber, status: "failed", reason: "xai_not_configured" };
  if (await findRegistration(phoneNumber)) return { phoneNumber, status: "already_registered" };
  // One registration per number at a time across every process (api and
  // voice services): the loser waits, then sees the winner's row, so no
  // process can delete a registration another one is about to store.
  return outsideTenant(() =>
    drizzle.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`xai_phone_registration:${phoneNumber}`}))`,
      );
      const [existing] = await tx
        .select({ phoneNumber: schema.xaiPhoneRegistrations.phoneNumber })
        .from(schema.xaiPhoneRegistrations)
        .where(eq(schema.xaiPhoneRegistrations.phoneNumber, phoneNumber))
        .limit(1);
      if (existing) return { phoneNumber, status: "already_registered" as const };
      return registerXAIPhoneNumberLocked(phoneNumber, (values) =>
        tx.insert(schema.xaiPhoneRegistrations).values(values),
      );
    }),
  );
}

async function registerXAIPhoneNumberLocked(
  phoneNumber: string,
  insert: (values: typeof schema.xaiPhoneRegistrations.$inferInsert) => PromiseLike<unknown>,
): Promise<XAIRegistrationResult> {
  const credentials = newSipCredentials();
  let response = await createXAIRegistration(phoneNumber, credentials);
  if (response.status === 409 || response.status === 400) {
    const stale = staleXAIRegistrations(await listXAIPhoneNumbers(), phoneNumber);
    if (stale.length) {
      for (const row of stale) await deleteXAIPhoneNumber(row.id);
      log.info("Replaced a stale xAI phone registration", { phoneSuffix: phoneNumber.slice(-4) });
      response = await createXAIRegistration(phoneNumber, credentials);
    }
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    log.error("xAI phone registration was refused", {
      phoneSuffix: phoneNumber.slice(-4),
      status: response.status,
      detail: detail.slice(0, 300),
    });
    return { phoneNumber, status: "failed", reason: `xai_http_${response.status}` };
  }

  const payload: unknown = await response.json();
  let registration: ReturnType<typeof parseXAIPhoneRegistration>;
  try {
    registration = parseXAIPhoneRegistration(payload);
  } catch (error) {
    // Field names only, never values: the payload carries a one-time secret.
    const body = asRecord(payload);
    log.error("xAI registration response did not match the documented shape", {
      phoneSuffix: phoneNumber.slice(-4),
      topLevelKeys: Object.keys(body),
      phoneNumberKeys: Object.keys(asRecord(body.phone_number)),
      webhookKeys: Object.keys(asRecord(body.webhook)),
    });
    const listed = (await listXAIPhoneNumbers()).find((row) => row.phoneNumber === phoneNumber);
    if (listed) await deleteXAIPhoneNumber(listed.id).catch(() => undefined);
    throw error;
  }
  try {
    await insert({
      phoneNumber,
      xaiPhoneNumberId: registration.xaiPhoneNumberId,
      xaiWebhookId: registration.xaiWebhookId,
      webhookSecretEncrypted: encryptSecret(registration.signingSecret),
      sipUsername: credentials.username,
      sipPasswordEncrypted: encryptSecret(credentials.password),
    });
  } catch (error) {
    // Without the stored secret the registration can never verify a call.
    // Remove it so a retry starts clean instead of colliding.
    await deleteXAIPhoneNumber(registration.xaiPhoneNumberId).catch(() => undefined);
    throw error;
  }
  return { phoneNumber, status: "registered" };
}

/** Remove a number's xAI registration (number released or moved off xAI). */
export async function deregisterXAIPhoneNumber(phoneNumber: string): Promise<boolean> {
  const row = await findRegistration(phoneNumber);
  if (!row) return false;
  await deleteXAIPhoneNumber(row.xaiPhoneNumberId);
  await outsideTenant(() =>
    drizzle
      .delete(schema.xaiPhoneRegistrations)
      .where(eq(schema.xaiPhoneRegistrations.phoneNumber, phoneNumber)),
  );
  return true;
}

/** Register every assigned BotBound number that is not on xAI yet. */
export async function syncXAIPhoneRegistrations(): Promise<{
  configured: boolean;
  results: XAIRegistrationResult[];
}> {
  if (!xaiSipConfigured()) return { configured: false, results: [] };
  const lines = await outsideTenant(() =>
    drizzle
      .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
      .from(schema.phoneNumbers)
      .where(isNotNull(schema.phoneNumbers.agentId)),
  );
  const results: XAIRegistrationResult[] = [];
  for (const line of lines) {
    try {
      results.push(await registerXAIPhoneNumber(line.phoneNumber));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("xAI phone registration failed", {
        phoneSuffix: line.phoneNumber.slice(-4),
        error: message.slice(0, 300),
      });
      results.push({
        phoneNumber: line.phoneNumber,
        status: "failed",
        // Only BotBound's own messages are returned; provider/database text stays in logs.
        reason: /^(xAI |XAI_API_KEY)/.test(message) ? message.slice(0, 200) : "see_server_logs",
      });
    }
  }
  return { configured: true, results };
}

export async function xaiRegistrationStatus() {
  const rows = await outsideTenant(() =>
    drizzle
      .select({
        phoneNumber: schema.xaiPhoneRegistrations.phoneNumber,
        createdAt: schema.xaiPhoneRegistrations.createdAt,
      })
      .from(schema.xaiPhoneRegistrations),
  );
  return {
    configured: xaiSipConfigured(),
    registered: rows.map((row) => ({
      phoneSuffix: row.phoneNumber.slice(-4),
      registeredAt: row.createdAt,
    })),
  };
}
