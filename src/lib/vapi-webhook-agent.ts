/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
/**
 * Resolves which Wireline agent should handle an incoming Vapi server webhook.
 *
 * Vapi forwards `call.phoneNumberId` when the dialed line is provisioned under
 * Wireline Admin → Phone Numbers (`wireline_phone_numbers.vapi_number_id`).
 * Account Holders can omit `?agentId=` on serverUrl when routing is inferred from this id.
 */

import { drizzle, log, IS_PROD } from "./server-context";
import * as schema from "../db/schema";
import { eq, desc } from "drizzle-orm";

export function extractVapiPhoneNumberId(
  body: Record<string, unknown> | undefined | null,
): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const message = body.message as Record<string, unknown> | undefined;
  const call =
    (message?.call as Record<string, unknown> | undefined) ??
    (body.call as Record<string, unknown> | undefined);

  const tidFromCall = typeof call?.phoneNumberId === "string" ? call.phoneNumberId.trim() : "";

  const phoneNumber =
    (body.phoneNumber as Record<string, unknown> | undefined) ??
    (message?.phoneNumber as Record<string, unknown> | undefined);
  const tidFromPhoneObj = typeof phoneNumber?.id === "string" ? phoneNumber.id.trim() : "";

  const tidTop =
    typeof body.phoneNumberId === "string"
      ? body.phoneNumberId.trim()
      : typeof message?.phoneNumberId === "string"
        ? (message.phoneNumberId as string).trim()
        : "";

  const out = tidFromCall || tidFromPhoneObj || tidTop;
  return out || undefined;
}

async function pickDefaultVoiceAgent(userId: string): Promise<string | null> {
  try {
    const [data] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(eq(schema.agents.userId, userId))
      .orderBy(desc(schema.agents.createdAt))
      .limit(1);

    return data?.id ?? null;
  } catch (err: any) {
    log.warn("pickDefaultVoiceAgent query failed", { userId, error: err.message });
    return null;
  }
}

export type ResolveVapiWebhookAgentResult =
  | { ok: true; webhookAgentId: string; agentUserId: string }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function resolveVapiWebhookAgent(opts: {
  payload: Record<string, unknown>;
  queryAgentId: string | undefined;
}): Promise<ResolveVapiWebhookAgentResult> {
  const queryRaw = opts.queryAgentId?.trim();
  const phoneNumberId = extractVapiPhoneNumberId(opts.payload);

  let resolvedAgentId: string | undefined;
  let enforceTenantUserId: string | null = null;

  if (phoneNumberId) {
    const [line] = await drizzle
      .select({ agentId: schema.phoneNumbers.agentId, userId: schema.phoneNumbers.userId })
      .from(schema.phoneNumbers)
      .where(eq(schema.phoneNumbers.vapiNumberId, phoneNumberId))
      .limit(1);

    if (line) {
      enforceTenantUserId = line.userId as string;
      if (line.agentId) {
        resolvedAgentId = line.agentId as string;
      } else {
        const [st] = await drizzle
          .select({ vapiPhoneInboundAgentId: schema.settings.vapiPhoneInboundAgentId })
          .from(schema.settings)
          .where(eq(schema.settings.userId, line.userId))
          .limit(1);

        const pref =
          typeof st?.vapiPhoneInboundAgentId === "string" ? st.vapiPhoneInboundAgentId.trim() : "";
        resolvedAgentId = pref || (await pickDefaultVoiceAgent(enforceTenantUserId)) || undefined;
      }
    } else {
      const [st] = await drizzle
        .select({
          userId: schema.settings.userId,
          vapiPhoneInboundAgentId: schema.settings.vapiPhoneInboundAgentId,
        })
        .from(schema.settings)
        .where(eq(schema.settings.vapiPhoneNumberId, phoneNumberId))
        .limit(1);

      if (st?.userId) {
        enforceTenantUserId = st.userId as string;
        const pref =
          typeof st.vapiPhoneInboundAgentId === "string" ? st.vapiPhoneInboundAgentId.trim() : "";
        resolvedAgentId = pref || (await pickDefaultVoiceAgent(enforceTenantUserId)) || undefined;
      }
    }
  }

  if (!resolvedAgentId && queryRaw) {
    if (IS_PROD && !phoneNumberId) {
      return {
        ok: false,
        status: 403,
        body: {
          error:
            "Production Vapi webhooks must route via a provisioned Wireline phone number. " +
            "Register the dialed line under Admin → Wireline Phone Numbers.",
        },
      };
    }
    resolvedAgentId = queryRaw;
    enforceTenantUserId = null;
  }

  if (!resolvedAgentId) {
    return {
      ok: false,
      status: 404,
      body: {
        error:
          "Cannot route Vapi webhook. Register the dialed Wireline ID under Admin → Wireline Phone Numbers and assign an agent, " +
          "or pair Default Wireline phone number ID with a Default inbound agent, " +
          "or call /api/vapi-webhook?agentId=YOUR_WIRELINE_AGENT_ID.",
      },
    };
  }

  const [agentRow] = await drizzle
    .select({ userId: schema.agents.userId })
    .from(schema.agents)
    .where(eq(schema.agents.id, resolvedAgentId))
    .limit(1);

  if (!agentRow?.userId) {
    return { ok: false, status: 404, body: { error: "Agent not found" } };
  }

  if (enforceTenantUserId && agentRow.userId !== enforceTenantUserId) {
    log.warn("Vapi webhook rejected mismatched tenant for agent resolution", {
      agentId: resolvedAgentId,
      expectedUserId: enforceTenantUserId,
      actualUserId: agentRow.userId,
    });
    return {
      ok: false,
      status: 403,
      body: { error: "Agent is not authorized for this dialed Wireline number." },
    };
  }

  return { ok: true, webhookAgentId: resolvedAgentId, agentUserId: agentRow.userId as string };
}
