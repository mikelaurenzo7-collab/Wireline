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

/**
 * The server reconciler owns admission, mailbox preflight, serialized phone
 * ownership, and mailbox creation in that order. A single request prevents
 * automatic web setup from bypassing those guards with independent purchases.
 * Retries preserve the committed Bot and reuse an already-owned phone line.
 */
export async function bootstrapManagedBotIdentity(
  agentId: string,
): Promise<BotIdentityBootstrapResult> {
  try {
    const response = await authFetch(
      `/api/agents/${encodeURIComponent(agentId)}/managed-identity`,
      {
        method: "POST",
        // The setup wizard owns this expected Free Builder activation state.
        // Keep its guide visible instead of stacking a second payment dialog.
        suppressTrialGateEvent: true,
      },
    );
    const body = (await safeJson(response)) as {
      ok?: boolean;
      code?: string;
      email?: string;
      phone_number?: string;
      custom_domain?: boolean;
    } | null;
    const email = typeof body?.email === "string" ? body.email.trim() || null : null;
    const phone = typeof body?.phone_number === "string" ? body.phone_number.trim() || null : null;
    const succeeded = response.ok && body?.ok === true;
    return {
      mailbox: {
        requested: true,
        provisioned: succeeded && Boolean(email),
        emailAddress: succeeded ? email : null,
        customDomain: succeeded && body?.custom_domain === true,
        status: response.status,
      },
      phone: {
        requested: true,
        provisioned: succeeded && Boolean(phone),
        phoneNumber: succeeded ? phone : null,
        activationRequired: response.status === 402 && body?.code === "ACTIVATION_REQUIRED",
        status: response.status,
      },
    };
  } catch {
    return {
      mailbox: {
        requested: true,
        provisioned: false,
        emailAddress: null,
        customDomain: false,
        status: 0,
      },
      phone: {
        requested: true,
        provisioned: false,
        phoneNumber: null,
        activationRequired: false,
        status: 0,
      },
    };
  }
}
