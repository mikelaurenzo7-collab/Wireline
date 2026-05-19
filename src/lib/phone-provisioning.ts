/**
 * Auto-provisions a Wireline voice number for a tenant from our own
 * Twilio account. Customers never see a Twilio bill — the number is
 * baked into their monthly tier price.
 *
 * Strategy:
 *   - Trigger at FIRST agent creation, not at signup. Defers the
 *     ~$1.15/mo Twilio number COGS until the tenant has shown
 *     intent (created an agent). Free-tier abuse stays cheap.
 *   - Per-tier cap on how many numbers a tenant can hold; pulled
 *     from STRIPE_PLANS[i].included_phone_numbers in plan-catalog.
 *   - The voice + SMS URL on every provisioned number points at
 *     our existing /api/vapi-webhook — same path the manual carrier
 *     onboarding uses.
 *   - The Twilio SID is persisted in phoneNumbers.vapiNumberId so
 *     we can later release the number on tenant churn / downgrade.
 *
 * Failure mode: if Twilio is unconfigured, balance is dry, or the
 * search returns no numbers, the call returns { ok: false, error }
 * and DOES NOT throw — the agent-create flow continues without a
 * number. The tenant sees "Your number is being provisioned" UI
 * and Mike gets a log line to act on.
 */

import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import { getTwilioClient } from "./twilio-service";
import { STRIPE_PLANS, planById, type StripePlanId } from "./plan-catalog";

interface ProvisionOpts {
  /** If passed, the new number is assigned to this agent. */
  agentId?: string;
  /** Preferred US area code, e.g. "415". Falls back to any-area-code on miss. */
  areaCode?: string;
  /** Free-text campaign attribution stamp on the row. */
  campaignLabel?: string;
}

interface ProvisionResult {
  ok: boolean;
  /** E.164 number on success. */
  phoneNumber?: string;
  /** Twilio SID — persisted so we can later release / port out. */
  twilioSid?: string;
  /**
   * Whether we minted a fresh number OR reused an existing one
   * because the tenant already had a number on this tier (Personal
   * caps at 1, Starter at 2, etc.).
   */
  reused?: boolean;
  error?: string;
}

/**
 * Look up the tenant's current plan id from settings → fall back to
 * Personal if no Stripe subscription is on file (trial tenants
 * pre-subscription still get 1 number from the Personal tier).
 */
async function resolveTenantPlan(userId: string): Promise<{
  plan: (typeof STRIPE_PLANS)[number];
  status: string | null;
}> {
  const [row] = await drizzle
    .select({
      plan: schema.subscriptions.plan,
      status: schema.subscriptions.status,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);

  const planId = (row?.plan as StripePlanId) || "personal";
  const plan = planById(planId) || STRIPE_PLANS[0];
  return { plan, status: row?.status ?? null };
}

async function countExistingNumbers(userId: string): Promise<number> {
  const [row] = await drizzle
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, userId));
  return row?.count ?? 0;
}

async function findFirstUnassignedNumber(userId: string) {
  const [row] = await drizzle
    .select()
    .from(schema.phoneNumbers)
    .where(and(eq(schema.phoneNumbers.userId, userId), sql`${schema.phoneNumbers.agentId} IS NULL`))
    .limit(1);
  return row ?? null;
}

export async function provisionTenantNumber(
  userId: string,
  opts: ProvisionOpts = {},
): Promise<ProvisionResult> {
  const client = getTwilioClient();
  if (!client) {
    return { ok: false, error: "Twilio not configured on platform." };
  }

  const { plan } = await resolveTenantPlan(userId);
  const existing = await countExistingNumbers(userId);

  // Cap check: if the tenant is at their tier limit, try to reuse
  // an unassigned number before refusing. This handles the
  // "delete agent → create new agent" flow gracefully.
  if (existing >= plan.included_phone_numbers) {
    const reusable = await findFirstUnassignedNumber(userId);
    if (reusable && opts.agentId) {
      await drizzle
        .update(schema.phoneNumbers)
        .set({ agentId: opts.agentId })
        .where(eq(schema.phoneNumbers.id, reusable.id));
      return {
        ok: true,
        phoneNumber: reusable.phoneNumber,
        twilioSid: reusable.vapiNumberId ?? undefined,
        reused: true,
      };
    }
    return {
      ok: false,
      error: `${plan.name} tier includes ${plan.included_phone_numbers} number${plan.included_phone_numbers === 1 ? "" : "s"}; upgrade to add more.`,
    };
  }

  // Build the voice/SMS webhook URL the new number will route to.
  // Same /api/vapi-webhook the manual carrier-onboarding flow uses.
  const baseUrl =
    process.env.APP_URL && process.env.APP_URL.length > 0
      ? process.env.APP_URL.replace(/\/+$/, "")
      : "https://trywireline.com";
  const voiceUrl = `${baseUrl}/api/vapi-webhook?agentId=${encodeURIComponent(opts.agentId || "")}`;
  const smsUrl = `${baseUrl}/api/sms/inbound`;

  try {
    // Search for a US local number with both voice + SMS support.
    // Falls back to any-area-code if the requested code is dry.
    const searchParams: any = {
      voiceEnabled: true,
      smsEnabled: true,
      limit: 5,
    };
    if (opts.areaCode && /^\d{3}$/.test(opts.areaCode)) {
      searchParams.areaCode = Number(opts.areaCode);
    }

    let candidates = await client.availablePhoneNumbers("US").local.list(searchParams);

    // Retry without area code if the constrained search was empty.
    if (candidates.length === 0 && opts.areaCode) {
      delete searchParams.areaCode;
      candidates = await client.availablePhoneNumbers("US").local.list(searchParams);
    }

    if (candidates.length === 0) {
      return { ok: false, error: "No US local numbers currently available from Twilio." };
    }

    // Pick the first candidate (Twilio returns by price → newest order).
    const chosen = candidates[0];
    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: chosen.phoneNumber,
      voiceUrl,
      voiceMethod: "POST",
      smsUrl,
      smsMethod: "POST",
      friendlyName: `Wireline · tenant ${userId.slice(0, 8)}`,
    });

    // Persist. agentId is set on the row so the Vapi webhook can
    // route inbound calls to the right tenant + agent.
    await drizzle.insert(schema.phoneNumbers).values({
      userId,
      phoneNumber: purchased.phoneNumber,
      vapiNumberId: purchased.sid,
      agentId: opts.agentId ?? null,
      campaignLabel: opts.campaignLabel ?? "auto-provisioned",
    });

    log.info("Provisioned tenant number", {
      userId,
      phoneNumber: purchased.phoneNumber,
      twilioSid: purchased.sid,
      planId: plan.id,
    });

    return {
      ok: true,
      phoneNumber: purchased.phoneNumber,
      twilioSid: purchased.sid,
      reused: false,
    };
  } catch (err) {
    log.error("provisionTenantNumber failed", {
      userId,
      error: getErrorMessage(err),
    });
    return { ok: false, error: getErrorMessage(err) };
  }
}

/**
 * Releases a Twilio number back to Twilio (frees the carrier
 * resource) and removes the row from phoneNumbers. Used on tenant
 * churn / downgrade so we don't keep paying Twilio's monthly
 * carrier fee for numbers a tenant can't use.
 */
export async function releaseTenantNumber(
  userId: string,
  phoneNumber: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = getTwilioClient();
  const [row] = await drizzle
    .select()
    .from(schema.phoneNumbers)
    .where(
      and(eq(schema.phoneNumbers.userId, userId), eq(schema.phoneNumbers.phoneNumber, phoneNumber)),
    )
    .limit(1);
  if (!row) return { ok: false, error: "Number not found for this tenant." };

  try {
    if (client && row.vapiNumberId) {
      await client
        .incomingPhoneNumbers(row.vapiNumberId)
        .remove()
        .catch((err) => {
          log.warn("Twilio release returned error (likely already released)", {
            twilioSid: row.vapiNumberId,
            error: getErrorMessage(err),
          });
        });
    }
    await drizzle.delete(schema.phoneNumbers).where(eq(schema.phoneNumbers.id, row.id));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: getErrorMessage(err) };
  }
}
