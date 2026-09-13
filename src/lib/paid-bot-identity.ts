import { and, asc, eq, inArray } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
  AGENTMAIL_MANAGED_SCOPE_MARKER,
  agentmailGrantedScopes,
  createAgentMailInbox,
  deleteAgentMailWebhook,
  ensureAgentMailWebhook,
  hasExactAgentMailManagedScope,
  listAgentMailInboxes,
  listAgentMailWebhooks,
  publicAgentMailWebhookUrl,
  verifyAgentMailCredentials,
  verifyManagedAgentMailDomainIdentity,
} from "./agentmail-mail";
import {
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE,
  upsertOwnedEmailAccount,
} from "./owned-email-account";
import { assertLiveExternalActionAllowed } from "./account-environment-policy";
import { planById } from "./plan-catalog";
import { getIncludedPhoneLineSlots } from "./phone-line-entitlements";
import { selectPaidBotIdentityAgents } from "./paid-bot-identity-capacity";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { encryptSecret, isVaultConfigured } from "./secret-vault";
import { runTenantProviderWorkWithDeletionFence } from "./tenant-provider-deletion-fence";
import { getTwilioClient } from "./twilio-service";
import { enqueue } from "./job-queue";
import { provisionNativeTenantNumber } from "./voice/native-phone-provisioning";
import { releaseNativeTenantNumber } from "./voice/native-phone-release";

// A Stripe trial is not a paid activation. Real carrier numbers and durable
// AgentMail inboxes are created only after Stripe reports an active paid
// subscription. Any future mailbox-only trial must use its own bounded
// entitlement and must never flow through this phone+mail identity lane.
const PAID_IDENTITY_STATUSES = new Set(["active"]);
const ACTIVE_IDENTITY_JOB_STATUSES = ["pending", "running", "failed"] as const;

export const PAID_BOT_IDENTITY_JOB_TYPE = "paid_bot_identity_reconcile" as const;

export type PaidBotIdentityResult = {
  eligible: boolean;
  planId: string | null;
  phone: string | null;
  email: string | null;
  phoneReused: boolean;
  emailReused: boolean;
};

function queuedIdentityAgentId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const agentId = (payload as Record<string, unknown>).agentId;
  return typeof agentId === "string" && agentId.trim() ? agentId.trim() : null;
}

/**
 * Attach only Bots covered by current phone capacity to the worker after paid
 * activation. Existing pending/running/retryable jobs are reused; completed or
 * dead jobs do not suppress a later Stripe reconciliation repair.
 */
export async function enqueuePaidBotIdentityReconciliation(userId: string): Promise<{
  agents: number;
  queued: number;
  alreadyQueued: number;
}> {
  const [agentIds, existingJobs] = await Promise.all([
    getPaidBotIdentityAgentIds(userId),
    drizzle
      .select({ payload: schema.jobs.payload })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.userId, userId),
          eq(schema.jobs.type, PAID_BOT_IDENTITY_JOB_TYPE),
          inArray(schema.jobs.status, [...ACTIVE_IDENTITY_JOB_STATUSES]),
        ),
      ),
  ]);
  const activeAgentIds = new Set(
    existingJobs.map((job) => queuedIdentityAgentId(job.payload)).filter(Boolean),
  );
  let queued = 0;
  for (const agentId of agentIds) {
    if (activeAgentIds.has(agentId)) continue;
    const result = await enqueue(drizzle, {
      userId,
      type: PAID_BOT_IDENTITY_JOB_TYPE,
      payload: { userId, agentId },
    });
    activeAgentIds.add(agentId);
    if (result.jobId) queued += 1;
  }
  return {
    agents: agentIds.length,
    queued,
    alreadyQueued: agentIds.length - queued,
  };
}

function normalizedManagedDomain(): string | null {
  const value = String(process.env.AGENTMAIL_DEFAULT_DOMAIN || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  if (!value) return null;
  if (
    value.length > 253 ||
    !value.includes(".") ||
    !value.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
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
  agentId?: string,
): Promise<{ eligible: boolean; planId: string | null; agentIds: string[] }> {
  const [row] = await drizzle
    .select({ planId: schema.subscriptions.plan, status: schema.subscriptions.status })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  const planId = row?.planId?.trim() || null;
  const status = row?.status?.trim().toLowerCase() || "";
  const plan = planById(planId);
  const paid =
    Boolean(planId) &&
    PAID_IDENTITY_STATUSES.has(status) &&
    Boolean(plan && plan.price_usd_monthly > 0 && plan.included_phone_numbers > 0);
  if (!paid) return { eligible: false, planId, agentIds: [] };

  const [agents, lines, phoneSlots] = await Promise.all([
    drizzle
      .select({ id: schema.agents.id, businessVariables: schema.agents.businessVariables })
      .from(schema.agents)
      .where(eq(schema.agents.userId, userId))
      .orderBy(asc(schema.agents.createdAt), asc(schema.agents.id)),
    drizzle
      .select({ agentId: schema.phoneNumbers.agentId })
      .from(schema.phoneNumbers)
      .where(eq(schema.phoneNumbers.userId, userId)),
    getIncludedPhoneLineSlots(userId),
  ]);
  // A paid active subscription includes at least one phone slot. Zero/invalid
  // live capacity indicates an inconsistent account projection, not an
  // intentionally private or over-capacity Bot. Surface it for retry/repair.
  if (!Number.isFinite(phoneSlots) || phoneSlots < 1) {
    throw new Error(
      "PAID_IDENTITY_ENTITLEMENT_MISMATCH: Active paid subscription has no live phone entitlement. Reconcile subscription and account settings before provisioning.",
    );
  }
  // The phone entitlement already includes purchased extras. A stored Bot-only
  // grant must not silently expand paid carrier/mailbox allocation. Recheck in
  // the worker as well as at enqueue time so stale jobs cannot outlive a downgrade.
  const agentIds = selectPaidBotIdentityAgents(agents, lines, phoneSlots);
  return { eligible: agentId ? agentIds.includes(agentId) : agentIds.length > 0, planId, agentIds };
}

function ineligibleIdentity(planId: string | null): PaidBotIdentityResult {
  return {
    eligible: false,
    planId,
    phone: null,
    email: null,
    phoneReused: false,
    emailReused: false,
  };
}

/** Read-only eligibility shared by queue admission and operator audits. */
export async function getPaidBotIdentityAgentIds(userId: string): Promise<string[]> {
  return (await paidPlanForUser(userId)).agentIds;
}

export async function assertTwilioOwnedNumber(phoneNumber: string): Promise<void> {
  const client = getTwilioClient();
  if (!client) throw new Error("Twilio is not configured for paid Bot identity provisioning.");
  const rows = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  if (!rows[0]?.sid) {
    throw new Error("Paid Bot line is not owned by the configured Twilio account.");
  }
}

async function ensurePaidBotPhone(userId: string, agentId: string) {
  const provisioned = await provisionNativeTenantNumber({
    userId,
    agentId,
    campaignLabel: "paid-bot-identity",
  });
  if (!provisioned.ok || !provisioned.phoneNumber) {
    throw new Error(provisioned.error || "Paid Bot phone provisioning did not return a number.");
  }

  try {
    await assertTwilioOwnedNumber(provisioned.phoneNumber);
  } catch (error) {
    // Paid Bot identity is Twilio-strict. Release an unverifiable allocation
    // and let the durable job retry rather than silently changing ownership.
    await releaseNativeTenantNumber(userId, provisioned.phoneNumber).catch((releaseError) =>
      log.error("Unverifiable paid Bot line could not be released", {
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
  emailAddress: string;
}): Promise<{ inboxId: string; email: string; reused: boolean }> {
  const domain = normalizedManagedDomain();
  if (!domain) {
    throw new Error(
      "AGENTMAIL_DEFAULT_DOMAIN is required before paid Bot managed-email provisioning can run.",
    );
  }

  const desiredEmail = input.emailAddress.trim().toLowerCase();
  if (!desiredEmail.endsWith(`@${domain}`)) {
    throw new Error("Reserved managed mailbox is not on the configured BotBound domain.");
  }
  const username = desiredEmail.slice(0, -(domain.length + 1));
  if (!username || desiredEmail !== `${username}@${domain}`) {
    throw new Error("Reserved managed mailbox address is invalid.");
  }
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
  if (inbox.email.toLowerCase() !== desiredEmail) {
    throw new Error("AgentMail did not create the exact reserved BotBound mailbox address.");
  }
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

async function preparePaidBotMailbox(userId: string, agentId: string) {
  const existingAccounts = await drizzle
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
    );
  const existing = existingAccounts.find((account) =>
    hasExactAgentMailManagedScope(account.oauthGrantedScopes),
  );

  if (!isVaultConfigured())
    throw new Error("Credential vault is not configured for managed email.");
  const apiKey = String(process.env.AGENTMAIL_API_KEY || "").replace(/\s+/g, "");
  if (!apiKey) throw new Error("AGENTMAIL_API_KEY is required for managed Bot email.");
  const domain = normalizedManagedDomain();
  if (!domain) {
    throw new Error(
      "AGENTMAIL_DEFAULT_DOMAIN is required before paid Bot managed-email provisioning can run.",
    );
  }
  if (!publicAgentMailWebhookUrl("configuration-check")) {
    throw new Error("AgentMail webhook registration requires a public APP_URL.");
  }
  if (existing && !existing.emailAddress.toLowerCase().endsWith(`@${domain}`)) {
    throw new Error("Existing managed mailbox is not on the configured BotBound domain.");
  }
  // Prove that this credential owns the exact verified BotBound domain before
  // any carrier purchase or mailbox reservation. A valid inbox list alone
  // could belong to a different organization.
  await verifyManagedAgentMailDomainIdentity(apiKey);
  await listAgentMailInboxes(apiKey);
  return { existing, apiKey, domain };
}

async function ensurePaidBotMailbox(
  userId: string,
  agentId: string,
  agentName: string,
  prepared: Awaited<ReturnType<typeof preparePaidBotMailbox>>,
) {
  const { existing, apiKey, domain } = prepared;
  if (existing) {
    const inbox = await resolveManagedInbox({
      apiKey,
      agentId,
      agentName,
      emailAddress: existing.emailAddress,
    });
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

  const reservedEmailAddress = `${managedMailboxUsername(agentName, agentId)}@${domain}`;
  // Persist the deterministic BotBound-managed address before calling the
  // provider. If AgentMail accepts creation and the process crashes, terminal
  // erasure and the next retry still have an authoritative local pointer.
  const connected = await upsertOwnedEmailAccount({
    userId,
    agentId,
    emailAddress: reservedEmailAddress,
    provider: "agentmail",
    accessToken: encryptSecret(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL),
    refreshToken: null,
    expiresAt: null,
    oauthGrantedScopes: `${agentmailGrantedScopes()} ${AGENTMAIL_MANAGED_SCOPE_MARKER}`,
  });
  if (!connected) throw new Error(EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE);

  const inbox = await resolveManagedInbox({
    apiKey,
    agentId,
    agentName,
    emailAddress: reservedEmailAddress,
  });
  await verifyAgentMailCredentials(inbox.email, apiKey);

  await ensureManagedDeliveryWebhook({
    apiKey,
    inboxId: inbox.inboxId,
    accountId: connected.id,
    userId,
    hasStoredSecret: false,
  });

  return { email: reservedEmailAddress, reused: inbox.reused };
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
    paidPlanForUser(input.userId, input.agentId),
  ]);
  if (!agent) throw new Error("Paid Bot identity job references a Bot that no longer exists.");
  if (!plan.eligible) {
    return ineligibleIdentity(plan.planId);
  }

  const fenced = await runTenantProviderWorkWithDeletionFence({
    userId: input.userId,
    operation: "paid_bot_identity_reconcile",
    // Match the managed mailbox route's crash horizon for accepted provider
    // operations, including successful automatic web setup.
    retainOnSuccess: true,
    perform: async (): Promise<PaidBotIdentityResult> => {
      await assertLiveExternalActionAllowed(input.userId, "paid_bot_identity_provision");
      const currentPlan = await paidPlanForUser(input.userId, input.agentId);
      if (!currentPlan.eligible) return ineligibleIdentity(currentPlan.planId);
      const mailbox = await preparePaidBotMailbox(input.userId, input.agentId);

      // Secure tenant-owned phone capacity before creating a managed mailbox.
      // Native phone persistence serializes competing provision/claim requests;
      // losing the last slot must not leave an unpaired mailbox above capacity.
      // A later mailbox failure is retried against this same owned phone line.
      const phone = await ensurePaidBotPhone(input.userId, input.agentId);
      const email = await ensurePaidBotMailbox(
        input.userId,
        input.agentId,
        agent.name || "Bot",
        mailbox,
      );

      return {
        eligible: true,
        planId: currentPlan.planId,
        phone: phone.phoneNumber,
        email: email.email,
        phoneReused: phone.reused,
        emailReused: email.reused,
      };
    },
  });
  if (!fenced.performed) {
    throw new Error(
      "Paid Bot identity provisioning is unavailable because account deletion is in progress.",
    );
  }
  return fenced.result;
}
