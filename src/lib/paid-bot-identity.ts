import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
  agentmailGrantedScopes,
  createAgentMailInbox,
  deleteAgentMailWebhook,
  ensureAgentMailWebhook,
  listAgentMailInboxes,
  listAgentMailWebhooks,
  verifyAgentMailCredentials,
} from "./agentmail-mail";
import {
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE,
  upsertOwnedEmailAccount,
} from "./owned-email-account";
import { assertLiveExternalActionAllowed } from "./account-environment-policy";
import { planById } from "./plan-catalog";
import { provisionTenantNumber, releaseTenantNumber } from "./phone-provisioning";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { encryptSecret, isVaultConfigured } from "./secret-vault";
import { getTwilioClient } from "./twilio-service";

const PAID_IDENTITY_STATUSES = new Set(["active", "trialing"]);
const MANAGED_SCOPE_MARKER = "managed-botbound";

export type PaidBotIdentityResult = {
  eligible: boolean;
  planId: string | null;
  phone: string | null;
  email: string | null;
  phoneReused: boolean;
  emailReused: boolean;
};

function normalizedManagedDomain(): string | null {
  const value = String(process.env.AGENTMAIL_DEFAULT_DOMAIN || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  if (!value) return null;
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(value) || !value.includes(".")) {
    throw new Error("AGENTMAIL_DEFAULT_DOMAIN is invalid.");
  }
  if (value !== "botbound.me" && !value.endsWith(".botbound.me")) {
    throw new Error("AGENTMAIL_DEFAULT_DOMAIN must be botbound.me or a BotBound subdomain.");
  }
  return value;
}

function managedMailboxUsername(agentName: string, agentId: string): string {
  const suffix =
    agentId
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .slice(-8) || "bot";
  const base =
    agentName
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "bot";
  const maxBaseLength = Math.max(1, 62 - suffix.length);
  return `${base.slice(0, maxBaseLength).replace(/-+$/g, "")}-${suffix}`.slice(0, 63);
}

async function paidPlanForUser(
  userId: string,
): Promise<{ eligible: boolean; planId: string | null }> {
  const [row] = await drizzle
    .select({ planId: schema.subscriptions.plan, status: schema.subscriptions.status })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  const planId = row?.planId?.trim() || null;
  const status = row?.status?.trim().toLowerCase() || "";
  const plan = planById(planId);
  return {
    eligible:
      Boolean(planId) &&
      PAID_IDENTITY_STATUSES.has(status) &&
      Boolean(plan && plan.price_usd_monthly > 0 && plan.included_phone_numbers > 0),
    planId,
  };
}

async function assertTwilioOwnedNumber(phoneNumber: string): Promise<void> {
  const client = getTwilioClient();
  if (!client) throw new Error("Twilio is not configured for paid Bot identity provisioning.");
  const rows = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (!rows[0]?.sid) {
    throw new Error("Paid Bot line is not owned by the configured Twilio account.");
  }
}

async function ensurePaidBotPhone(userId: string, agentId: string) {
  const provisioned = await provisionTenantNumber(userId, {
    agentId,
    campaignLabel: "paid-bot-identity",
  });
  if (!provisioned.ok || !provisioned.phoneNumber) {
    throw new Error(provisioned.error || "Paid Bot phone provisioning did not return a number.");
  }

  try {
    await assertTwilioOwnedNumber(provisioned.phoneNumber);
  } catch (error) {
    // The legacy provisioner can fall back to Vapi-owned inventory. Paid Bot
    // identity is Twilio-strict: release that allocation and let the durable job
    // retry instead of silently changing carrier ownership.
    await releaseTenantNumber(userId, provisioned.phoneNumber).catch((releaseError) =>
      log.error("Non-Twilio paid Bot line could not be released", {
        userId,
        agentId,
        phoneNumber: provisioned.phoneNumber,
        error: getErrorMessage(releaseError),
      }),
    );
    throw error;
  }

  return {
    phoneNumber: provisioned.phoneNumber,
    reused: Boolean(provisioned.reused),
  };
}

async function resolveManagedInbox(input: {
  apiKey: string;
  agentId: string;
  agentName: string;
}): Promise<{ inboxId: string; email: string; reused: boolean }> {
  const domain = normalizedManagedDomain();
  if (!domain) {
    throw new Error(
      "AGENTMAIL_DEFAULT_DOMAIN is required before paid Bot managed-email provisioning can run.",
    );
  }

  const username = managedMailboxUsername(input.agentName, input.agentId);
  const desiredEmail = `${username}@${domain}`;
  const existing = (await listAgentMailInboxes(input.apiKey)).find(
    (inbox) => inbox.email.toLowerCase() === desiredEmail,
  );
  if (existing) return { ...existing, reused: true };

  const inbox = await createAgentMailInbox(input.apiKey, username, input.agentName, {
    domain,
    clientId: `botbound-agent:${input.agentId}:${domain}`,
    metadata: {
      platform: "BotBound",
      agent_id: input.agentId,
      managed: true,
    },
  });
  return { ...inbox, reused: false };
}

async function ensureManagedDeliveryWebhook(input: {
  apiKey: string;
  inboxId: string;
  accountId: string;
  userId: string;
  hasStoredSecret: boolean;
}): Promise<void> {
  const ensured = await ensureAgentMailWebhook({
    apiKey: input.apiKey,
    inboxId: input.inboxId,
    accountId: input.accountId,
    hasStoredSecret: input.hasStoredSecret,
  });
  if (!ensured) {
    throw new Error("AgentMail webhook registration requires a public APP_URL.");
  }

  // A reused webhook with a stored encrypted secret is already verifiable. AgentMail
  // does not need to re-expose that secret on every reconciliation pass.
  if (!ensured.secret && input.hasStoredSecret) return;

  let signingSecret = ensured.secret;
  if (!signingSecret) {
    signingSecret =
      (await listAgentMailWebhooks(input.apiKey)).find(
        (webhook) => webhook.webhookId === ensured.webhookId,
      )?.secret ?? null;
  }
  if (!signingSecret) {
    await deleteAgentMailWebhook(input.apiKey, ensured.webhookId).catch((cleanupError) =>
      log.warn("Unverifiable paid Bot AgentMail webhook cleanup failed", {
        userId: input.userId,
        accountId: input.accountId,
        webhookId: ensured.webhookId,
        error: getErrorMessage(cleanupError),
      }),
    );
    throw new Error("AgentMail webhook did not expose its signing secret.");
  }

  const updated = await drizzle
    .update(schema.emailAccounts)
    .set({ refreshToken: encryptSecret(signingSecret) })
    .where(
      and(
        eq(schema.emailAccounts.id, input.accountId),
        eq(schema.emailAccounts.userId, input.userId),
      ),
    )
    .returning({ id: schema.emailAccounts.id });
  if (updated.length !== 1) {
    throw new Error("AgentMail signing secret was not stored on the managed mailbox account.");
  }
}

async function ensurePaidBotMailbox(userId: string, agentId: string, agentName: string) {
  const [existing] = await drizzle
    .select({
      id: schema.emailAccounts.id,
      emailAddress: schema.emailAccounts.emailAddress,
      oauthGrantedScopes: schema.emailAccounts.oauthGrantedScopes,
      refreshToken: schema.emailAccounts.refreshToken,
    })
    .from(schema.emailAccounts)
    .where(
      and(
        eq(schema.emailAccounts.userId, userId),
        eq(schema.emailAccounts.agentId, agentId),
        eq(schema.emailAccounts.provider, "agentmail"),
      ),
    )
    .limit(1);

  if (!isVaultConfigured())
    throw new Error("Credential vault is not configured for managed email.");
  const apiKey = String(process.env.AGENTMAIL_API_KEY || "").replace(/\s+/g, "");
  if (!apiKey) throw new Error("AGENTMAIL_API_KEY is required for managed Bot email.");

  if (existing?.oauthGrantedScopes?.includes(MANAGED_SCOPE_MARKER)) {
    const domain = normalizedManagedDomain();
    if (!domain || !existing.emailAddress.toLowerCase().endsWith(`@${domain}`)) {
      throw new Error("Existing managed mailbox is not on the configured BotBound domain.");
    }
    const inbox = (await listAgentMailInboxes(apiKey)).find(
      (candidate) => candidate.email.toLowerCase() === existing.emailAddress.toLowerCase(),
    );
    if (!inbox) {
      throw new Error(
        "Managed AgentMail inbox is missing from the configured AgentMail organization.",
      );
    }
    await verifyAgentMailCredentials(inbox.email, apiKey);
    await ensureManagedDeliveryWebhook({
      apiKey,
      inboxId: inbox.inboxId,
      accountId: existing.id,
      userId,
      hasStoredSecret: Boolean(existing.refreshToken),
    });
    return { email: existing.emailAddress, reused: true };
  }

  const inbox = await resolveManagedInbox({ apiKey, agentId, agentName });
  await verifyAgentMailCredentials(inbox.email, apiKey);
  const connected = await upsertOwnedEmailAccount({
    userId,
    agentId,
    emailAddress: inbox.email,
    provider: "agentmail",
    accessToken: encryptSecret(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL),
    refreshToken: null,
    expiresAt: null,
    oauthGrantedScopes: `${agentmailGrantedScopes()} ${MANAGED_SCOPE_MARKER}`,
  });
  if (!connected) throw new Error(EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE);

  await ensureManagedDeliveryWebhook({
    apiKey,
    inboxId: inbox.inboxId,
    accountId: connected.id,
    userId,
    hasStoredSecret: false,
  });

  return { email: inbox.email, reused: inbox.reused };
}

/**
 * Idempotent paid-Bot identity reconciler.
 *
 * A paid Bot is not fully activated until both resources exist:
 * - a number owned by BotBound's Twilio account and imported into the voice runtime;
 * - a platform-managed AgentMail inbox on the configured verified custom domain.
 *
 * The durable queue retries transient provider failures. Free Builder and
 * inactive/canceled plans exit without allocating provider resources.
 */
export async function ensurePaidBotIdentity(input: {
  userId: string;
  agentId: string;
}): Promise<PaidBotIdentityResult> {
  const [agent, plan] = await Promise.all([
    drizzle
      .select({ id: schema.agents.id, name: schema.agents.name })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    paidPlanForUser(input.userId),
  ]);
  if (!agent) throw new Error("Paid Bot identity job references a Bot that no longer exists.");
  if (!plan.eligible) {
    return {
      eligible: false,
      planId: plan.planId,
      phone: null,
      email: null,
      phoneReused: false,
      emailReused: false,
    };
  }

  await assertLiveExternalActionAllowed(input.userId, "paid_bot_identity_provision");

  const phone = await ensurePaidBotPhone(input.userId, input.agentId);
  const email = await ensurePaidBotMailbox(input.userId, input.agentId, agent.name || "Bot");

  return {
    eligible: true,
    planId: plan.planId,
    phone: phone.phoneNumber,
    email: email.email,
    phoneReused: phone.reused,
    emailReused: email.reused,
  };
}
