/**
 * Automated Vapi phone line provisioning for a Wireline tenant.
 *
 * Buys/allocates a `provider: "vapi"` number via Vapi, points webhooks at
 * this deployment's /api/vapi-webhook, then inserts wireline_phone_numbers.
 */

import { and, count, eq } from "drizzle-orm";
import { drizzle, fetchWithTimeout, IS_PROD, log } from "./server-context";
import * as schema from "../db/schema";
import { getIncludedPhoneLineSlots } from "./phone-line-entitlements";
import { sanitizePhone } from "./vapi-helpers";

export function resolvePublicBaseUrl(): string | null {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return (vercel.startsWith("http") ? vercel : `https://${vercel}`).replace(/\/+$/, "");
  return null;
}

export type ProvisionVapiPhoneLineResult =
  | { ok: true; phone_number: string; vapi_number_id: string; db_id: string }
  | { ok: false; status: number; error: string };

async function tenantExists(userId: string): Promise<boolean> {
  const [st] = await drizzle
    .select({ userId: schema.settings.userId })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  if (st) return true;
  const [ag] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId))
    .limit(1);
  return !!ag;
}

async function assertPhoneLineCapacity(
  userId: string,
): Promise<ProvisionVapiPhoneLineResult | null> {
  const [row] = await drizzle
    .select({ val: count() })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, userId));
  const used = Number(row?.val || 0);
  const cap = await getIncludedPhoneLineSlots(userId);
  if (used >= cap) {
    return { ok: false, status: 402, error: "Phone line limit reached for this account." };
  }
  return null;
}

async function configureVapiPhoneWebhooks(
  vapiKey: string,
  vapiPhoneId: string,
  webhookUrl: string,
): Promise<boolean> {
  const secret = process.env.VAPI_WEBHOOK_SECRET?.trim();
  const attempts: Record<string, unknown>[] = [
    { serverUrl: webhookUrl, ...(secret ? { serverUrlSecret: secret } : {}) },
    { server: { url: webhookUrl, ...(secret ? { secret } : {}) } },
  ];
  for (const body of attempts) {
    const pr = await fetchWithTimeout(
      `https://api.vapi.ai/phone-number/${encodeURIComponent(vapiPhoneId)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${vapiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      25_000,
    );
    if (pr.ok) return true;
    const detail = await pr.text();
    log.warn("Vapi phone-number PATCH failed; trying alternate payload shape", {
      status: pr.status,
      keys: Object.keys(body),
      detail: detail.slice(0, 400),
    });
  }
  return false;
}

/**
 * Allocate a Vapi-managed number and attach it to the given Wireline user.
 */
export async function provisionVapiPhoneLineForUser(opts: {
  userId: string;
  agentId?: string | null;
  name?: string | null;
}): Promise<ProvisionVapiPhoneLineResult> {
  const vapiKey = process.env.VAPI_PRIVATE_KEY?.trim();
  if (!vapiKey) {
    return {
      ok: false,
      status: 503,
      error: "Voice provisioning is not configured (missing VAPI_PRIVATE_KEY).",
    };
  }
  if (IS_PROD && !process.env.VAPI_WEBHOOK_SECRET?.trim()) {
    return {
      ok: false,
      status: 503,
      error: "VAPI_WEBHOOK_SECRET must be set before provisioning numbers in production.",
    };
  }

  const base = resolvePublicBaseUrl();
  if (!base) {
    return {
      ok: false,
      status: 503,
      error: "Set APP_URL (or rely on VERCEL_URL) so inbound webhooks can be registered with Vapi.",
    };
  }
  const webhookUrl = `${base}/api/vapi-webhook`;

  const capErr = await assertPhoneLineCapacity(opts.userId);
  if (capErr) return capErr;

  if (!(await tenantExists(opts.userId))) {
    return { ok: false, status: 404, error: "Unknown tenant user_id." };
  }

  let agentId: string | null = opts.agentId?.trim() || null;
  if (agentId) {
    const [a] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, opts.userId)))
      .limit(1);
    if (!a) {
      return { ok: false, status: 400, error: "agent_id does not exist on this tenant." };
    }
  }

  const label = (opts.name?.trim() || "Wireline voice line").slice(0, 120);

  const createRes = await fetchWithTimeout(
    "https://api.vapi.ai/phone-number",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${vapiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "vapi", name: label }),
    },
    35_000,
  );
  if (!createRes.ok) {
    const t = await createRes.text();
    log.error("Vapi POST /phone-number failed", {
      status: createRes.status,
      body: t.slice(0, 800),
    });
    return {
      ok: false,
      status: 502,
      error: `Vapi rejected number provisioning (${createRes.status}). ${t.slice(0, 240)}`,
    };
  }

  const created = (await createRes.json()) as Record<string, unknown>;
  const vid = typeof created.id === "string" ? created.id : "";
  const rawNum =
    typeof created.number === "string"
      ? created.number
      : typeof created.phoneNumber === "string"
        ? (created.phoneNumber as string)
        : "";
  if (!vid || !rawNum) {
    log.error("Vapi create phone-number returned unexpected shape", { keys: Object.keys(created) });
    return {
      ok: false,
      status: 502,
      error: "Vapi returned an unexpected phone number payload (missing id or number).",
    };
  }

  const phoneE164 = sanitizePhone(rawNum) || rawNum;

  const patched = await configureVapiPhoneWebhooks(vapiKey, vid, webhookUrl);
  if (!patched) {
    log.error("Could not PATCH Vapi phone number with Wireline webhook URL", { vapiId: vid });
    return {
      ok: false,
      status: 502,
      error:
        "Number was created in Vapi but the webhook URL could not be applied automatically. Configure server URL in the Vapi dashboard or retry.",
    };
  }

  const [dup] = await drizzle
    .select({ userId: schema.phoneNumbers.userId, id: schema.phoneNumbers.id })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.phoneNumber, phoneE164))
    .limit(1);

  if (dup?.userId && dup.userId !== opts.userId) {
    return {
      ok: false,
      status: 409,
      error: "That number is already registered to another Wireline account.",
    };
  }

  if (dup?.userId === opts.userId && dup.id != null) {
    await drizzle
      .update(schema.phoneNumbers)
      .set({ vapiNumberId: vid, agentId })
      .where(eq(schema.phoneNumbers.phoneNumber, phoneE164));
    return { ok: true, phone_number: phoneE164, vapi_number_id: vid, db_id: String(dup.id) };
  }

  const [ins] = await drizzle
    .insert(schema.phoneNumbers)
    .values({
      userId: opts.userId,
      phoneNumber: phoneE164,
      vapiNumberId: vid,
      agentId,
    })
    .returning({ id: schema.phoneNumbers.id });

  return {
    ok: true,
    phone_number: phoneE164,
    vapi_number_id: vid,
    db_id: ins?.id != null ? String(ins.id) : "",
  };
}
