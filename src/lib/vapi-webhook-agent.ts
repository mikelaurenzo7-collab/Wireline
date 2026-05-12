/**
 * Resolves which Wireline agent should handle an incoming Vapi server webhook.
 *
 * Vapi forwards `call.phoneNumberId` when the dialed line is provisioned under
 * Wireline Admin → Phone Numbers (`wireline_phone_numbers.vapi_number_id`).
 * Operators can omit `?agentId=` on serverUrl when routing is inferred from this id.
 */

import { db, log } from "./server-context";

export function extractVapiPhoneNumberId(body: Record<string, unknown> | undefined | null): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const message = body.message as Record<string, unknown> | undefined;
  const call =
    (message?.call as Record<string, unknown> | undefined)
    ?? (body.call as Record<string, unknown> | undefined);

  const tidFromCall =
    typeof call?.phoneNumberId === "string" ? call.phoneNumberId.trim() : "";

  const phoneNumber =
    (body.phoneNumber as Record<string, unknown> | undefined)
    ?? (message?.phoneNumber as Record<string, unknown> | undefined);
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
  const { data, error } = await db
    .from("wireline_agents")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) log.warn("pickDefaultVoiceAgent query failed", { userId, error: error.message });
  return data?.id ?? null;
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
    const { data: line, error: lineErr } = await db
      .from("wireline_phone_numbers")
      .select("agent_id, user_id")
      .eq("vapi_number_id", phoneNumberId)
      .maybeSingle();

    if (lineErr) {
      log.warn("resolveVapiWebhookAgent wireline_phone_numbers lookup failed", {
        phoneNumberId,
        error: lineErr.message,
      });
    }

    if (line) {
      enforceTenantUserId = line.user_id as string;
      if (line.agent_id) {
        resolvedAgentId = line.agent_id as string;
      } else {
        const { data: st } = await db
          .from("wireline_settings")
          .select("vapi_phone_inbound_agent_id")
          .eq("user_id", line.user_id)
          .maybeSingle();
        const pref =
          typeof st?.vapi_phone_inbound_agent_id === "string" ? st.vapi_phone_inbound_agent_id.trim() : "";
        resolvedAgentId =
          pref
          || (await pickDefaultVoiceAgent(enforceTenantUserId))
          || undefined;
      }
    } else {
      const { data: st, error: stErr } = await db
        .from("wireline_settings")
        .select("user_id, vapi_phone_inbound_agent_id")
        .eq("vapi_phone_number_id", phoneNumberId)
        .maybeSingle();

      if (stErr) {
        log.warn("resolveVapiWebhookAgent settings lookup failed", {
          phoneNumberId,
          error: stErr.message,
        });
      }

      if (st?.user_id) {
        enforceTenantUserId = st.user_id as string;
        const pref =
          typeof st.vapi_phone_inbound_agent_id === "string" ? st.vapi_phone_inbound_agent_id.trim() : "";
        resolvedAgentId =
          pref
          || (await pickDefaultVoiceAgent(enforceTenantUserId))
          || undefined;
      }
    }
  }

  if (!resolvedAgentId && queryRaw) {
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

  const { data: agentRow, error: agentErr } = await db
    .from("wireline_agents")
    .select("user_id")
    .eq("id", resolvedAgentId)
    .maybeSingle();

  if (agentErr) {
    log.warn("resolveVapiWebhookAgent agent lookup failed", { resolvedAgentId, error: agentErr.message });
  }

  if (!agentRow?.user_id) {
    return { ok: false, status: 404, body: { error: "Agent not found" } };
  }

  if (enforceTenantUserId && agentRow.user_id !== enforceTenantUserId) {
    log.warn("Vapi webhook rejected mismatched tenant for agent resolution", {
      agentId: resolvedAgentId,
      expectedUserId: enforceTenantUserId,
      actualUserId: agentRow.user_id,
    });
    return {
      ok: false,
      status: 403,
      body: { error: "Agent is not authorized for this dialed Wireline number." },
    };
  }

  return { ok: true, webhookAgentId: resolvedAgentId, agentUserId: agentRow.user_id as string };
}
