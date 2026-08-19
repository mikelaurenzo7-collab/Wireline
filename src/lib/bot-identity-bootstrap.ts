import { authFetch, safeJson } from "./api";

export type ManagedMailboxBootstrap = {
  requested: true;
  provisioned: boolean;
  emailAddress: string | null;
  customDomain: boolean;
  status: number;
};

export type ManagedPhoneBootstrap = {
  requested: true;
  provisioned: boolean;
  phoneNumber: string | null;
  activationRequired: boolean;
  status: number;
};

export type BotIdentityBootstrapResult = {
  mailbox: ManagedMailboxBootstrap;
  phone: ManagedPhoneBootstrap;
};

async function bootstrapMailbox(agentId: string): Promise<ManagedMailboxBootstrap> {
  try {
    const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/managed-mailbox`, {
      method: "POST",
    });
    const body = (await safeJson(response)) as {
      ok?: boolean;
      email?: string;
      custom_domain?: boolean;
    } | null;
    return {
      requested: true,
      provisioned: response.ok && body?.ok !== false && Boolean(body?.email),
      emailAddress: typeof body?.email === "string" && body.email.trim() ? body.email.trim() : null,
      customDomain: body?.custom_domain === true,
      status: response.status,
    };
  } catch {
    return {
      requested: true,
      provisioned: false,
      emailAddress: null,
      customDomain: false,
      status: 0,
    };
  }
}

async function bootstrapPhone(agentId: string): Promise<ManagedPhoneBootstrap> {
  try {
    const response = await authFetch("/api/phone-numbers/provision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId }),
    });
    const body = (await safeJson(response)) as {
      ok?: boolean;
      code?: string;
      phone_number?: string;
      phoneNumber?: string;
    } | null;
    const phoneNumber =
      typeof body?.phone_number === "string" && body.phone_number.trim()
        ? body.phone_number.trim()
        : typeof body?.phoneNumber === "string" && body.phoneNumber.trim()
          ? body.phoneNumber.trim()
          : null;
    return {
      requested: true,
      provisioned: response.ok && body?.ok !== false,
      phoneNumber,
      activationRequired: response.status === 402 && body?.code === "ACTIVATION_REQUIRED",
      status: response.status,
    };
  } catch {
    return {
      requested: true,
      provisioned: false,
      phoneNumber: null,
      activationRequired: false,
      status: 0,
    };
  }
}

/**
 * Provision the BotBound-managed communication identity after the Bot record is
 * safely committed. Phone and email are intentionally independent: a missing
 * paid entitlement, carrier outage, or mail-provider outage may defer one
 * channel without rolling back the Bot or the channel that did succeed.
 *
 * Both server routes are idempotent, so this helper is safe to retry from the
 * post-create guide after a transient failure.
 */
export async function bootstrapManagedBotIdentity(
  agentId: string,
): Promise<BotIdentityBootstrapResult> {
  const [mailbox, phone] = await Promise.all([bootstrapMailbox(agentId), bootstrapPhone(agentId)]);
  return { mailbox, phone };
}
