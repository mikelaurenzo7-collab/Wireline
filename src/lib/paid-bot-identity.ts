import { and, asc, eq, inArray } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
  AGENTMAIL_MANAGED_SCOPE_MARKER,
  agentmailGrantedScopes,
  createAgentMailInbox,
  deleteAgentMailWebhooksForAccount,
  ensureAgentMailWebhook,
  getAgentMailWebhook,
  hasExactAgentMailManagedScope,
  listAgentMailInboxes,
  publicAgentMailWebhookUrl,
  verifyAgentMailCredentials,
  verifyManagedAgentMailDomainIdentity,
} from "./agentmail-mail";
import {
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE,
  upsertOwnedEmailAccount,
} from "./owned-email-account";
import { assertLiveExternalActionAllowed } from "./account-environment-policy";
import { findAgentPhoneLine } from "./agent-phone-lines";
import { planById } from "./plan-catalog";
import { getTenantChannelEntitlements, requireTenantChannel } from "./channel-entitlements";
import { getIncludedPhoneLineSlots } from "./phone-line-entitlements";
import { selectPaidBotIdentityAgents } from "./paid-bot-identity-capacity";
import { drizzle } from "./server-context";
import { encryptSecret, isVaultConfigured } from "./secret-vault";
import { runTenantProviderWorkWithDeletionFence } from "./tenant-provider-deletion-fence";
import { getTwilioClient } from "./twilio-service";
import { enqueue } from "./job-queue";
import { provisionNativeTenantNumber } from "./voice/native-phone-provisioning";
import {
  existingManagedEmailDomain,
  isBotBoundManagedEmailDomain,
} from "./managed-agentmail-domain";

// A Stripe trial is not a paid activation. Real carrier numbers and durable
// AgentMail inboxes are created only after Stripe reports an active paid
// subscription. Any future mailbox-only trial must use its own bounded
// entitlement and must never flow through this phone+mail identity lane.
const PAID_IDENTITY_STATUSES = new Set(["active"]);
const ACTIVE_IDENTITY_JOB_STATUSES = ["pending", "running", "failed"] as const;

export const PAID_BOT_IDENTITY_JOB_TYPE = "paid_bot_identity_reconcile" as const;

export type PaidBotIdentityResult = {
  eligible: boolean;
  selectionRequired: boolean;
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
  if (!isBotBoundManagedEmailDomain(value)) {
    throw new Error("AGENTMAIL_DEFAULT_DOMAIN must be botbound.app or a BotBound subdomain.");
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
): Promise<{
  eligible: boolean;
  planId: string | null;
  agentIds: string[];
  phoneAgentIds: string[];
  mailboxAgentIds: string[];
}> {
  const entitlement = await getTenantChannelEntitlements(userId);
  const planId = entitlement.planId;
  const status = entitlement.subscriptionStatus;
  const plan = planById(planId);
  const paid =
    Boolean(planId) &&
    PAID_IDENTITY_STATUSES.has(status) &&
    Boolean(plan && plan.price_usd_monthly > 0);
  if (!paid)
    return { eligible: false, planId, agentIds: [], phoneAgentIds: [], mailboxAgentIds: [] };

  const includesPhone = entitlement.channels.some(
    (channel) => channel === "voice" || channel === "sms",
  );
  const includesEmail = entitlement.channels.includes("email");
  const [agents, lines, phoneSlots, mailboxes] = await Promise.all([
    drizzle
      .select({ id: schema.agents.id, businessVariables: schema.agents.businessVariables })
      .from(schema.agents)
      .where(eq(schema.agents.userId, userId))
      .orderBy(asc(schema.agents.createdAt), asc(schema.agents.id)),
    includesPhone
      ? drizzle
          .select({ agentId: schema.phoneNumbers.agentId })
          .from(schema.phoneNumbers)
          .where(eq(schema.phoneNumbers.userId, userId))
      : Promise.resolve<Array<{ agentId: string | null }>>([]),
    includesPhone ? getIncludedPhoneLineSlots(userId) : Promise.resolve(0),
    includesEmail
      ? drizzle
          .select({
            agentId: schema.emailAccounts.agentId,
            oauthGrantedScopes: schema.emailAccounts.oauthGrantedScopes,
          })
          .from(schema.emailAccounts)
          .where(
            and(
              eq(schema.emailAccounts.userId, userId),
              eq(schema.emailAccounts.provider, "agentmail"),
            ),
          )
      : Promise.resolve<Array<{ agentId: string | null; oauthGrantedScopes: string | null }>>([]),
  ]);
  // A paid active subscription includes at least one phone slot. Zero/invalid
  // live capacity indicates an inconsistent account projection, not an
  // intentionally private or over-capacity Bot. Surface it for retry/repair.
  if (includesPhone && (!Number.isFinite(phoneSlots) || phoneSlots < 1)) {
    throw new Error(
      "PAID_IDENTITY_ENTITLEMENT_MISMATCH: Active paid subscription has no live phone entitlement. Reconcile subscription and account settings before provisioning.",
    );
  }
  // The phone entitlement already includes purchased extras. A stored Bot-only
  // grant must not silently expand paid carrier/mailbox allocation. Recheck in
  // the worker as well as at enqueue time so stale jobs cannot outlive a downgrade.
  const phoneAgentIds = selectPaidBotIdentityAgents(agents, lines, phoneSlots);
  const mailboxSlots = includesEmail
    ? plan?.catalogFamily === "legacy"
      ? phoneSlots
      : (plan?.included_mailboxes ?? 0)
    : 0;
  const mailboxAgentIds = !includesEmail
    ? []
    : plan?.catalogFamily === "legacy"
      ? phoneAgentIds
      : selectPaidBotIdentityAgents(
          agents,
          mailboxes
            .filter((mailbox) => hasExactAgentMailManagedScope(mailbox.oauthGrantedScopes))
            .map((mailbox) => ({ agentId: mailbox.agentId ?? "unassigned-managed-mailbox" })),
          mailboxSlots,
        );
  const agentIds = [...new Set([...phoneAgentIds, ...mailboxAgentIds])];
  return {
    eligible: agentId ? agentIds.includes(agentId) : agentIds.length > 0,
    planId,
    agentIds,
    phoneAgentIds,
    mailboxAgentIds,
  };
}

function ineligibleIdentity(planId: string | null): PaidBotIdentityResult {
  return {
    eligible: false,
    selectionRequired: false,
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

export async function getPaidBotMailboxAgentIds(userId: string): Promise<string[]> {
  return (await paidPlanForUser(userId)).mailboxAgentIds;
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
    requireExistingLine: true,
  });
  if (provisioned.code === "NUMBER_SELECTION_REQUIRED") return null;
  if (!provisioned.ok || !provisioned.phoneNumber) {
    throw new Error(provisioned.error || "Paid Bot phone provisioning did not return a number.");
  }

  // Provisioning has already persisted tenant ownership, including reused live
  // lines. An unavailable or inconclusive read must never surrender that number
  // to the carrier. Fail closed before mailbox work and let the durable retry
  // verify the same reserved line; explicit release owns destructive cleanup.
  await assertTwilioOwnedNumber(provisioned.phoneNumber);

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
  domain: string;
}): Promise<{ inboxId: string; email: string; reused: boolean }> {
  const domain = input.domain;
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
  if (!isBotBoundManagedEmailDomain(domain)) {
    throw new Error(
      "Existing legacy managed mailbox is missing from AgentMail; restore its identity before reconciliation.",
    );
  }

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
    signingSecret = (await getAgentMailWebhook(input.apiKey, ensured.webhookId)).secret;
  }
  if (!signingSecret) {
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
  await deleteAgentMailWebhooksForAccount({
    apiKey: input.apiKey,
    accountId: input.accountId,
    keepWebhookId: ensured.webhookId,
  });
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
  const domain = existing
    ? existingManagedEmailDomain(existing.emailAddress)
    : normalizedManagedDomain();
  if (existing && !domain) {
    throw new Error("Existing managed mailbox is not on the configured BotBound domain.");
  }
  if (!domain) {
    throw new Error(
      "AGENTMAIL_DEFAULT_DOMAIN is required before paid Bot managed-email provisioning can run.",
    );
  }
  if (!publicAgentMailWebhookUrl("configuration-check")) {
    throw new Error("AgentMail webhook registration requires a public APP_URL.");
  }
  // Prove that this credential owns the exact verified BotBound domain before
  // any carrier purchase or mailbox reservation. A valid inbox list alone
  // could belong to a different organization.
  await verifyManagedAgentMailDomainIdentity(apiKey, undefined, domain);
  const inboxes = await listAgentMailInboxes(apiKey);
  if (
    existing &&
    !isBotBoundManagedEmailDomain(domain) &&
    !inboxes.some(
      (inbox) => inbox.email.toLowerCase() === existing.emailAddress.trim().toLowerCase(),
    )
  ) {
    throw new Error(
      "Existing legacy managed mailbox is missing from AgentMail; restore its identity before reconciliation.",
    );
  }
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
      domain,
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
    domain,
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
 * Only resources included in the current package are reconciled. Customers
 * choose their phone number; Email setup can complete independently.
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
  // Waiting for a customer's choice is a local state, not a provider failure.
  // Avoid mail/carrier preflight and its retry budget until an owned line exists.
  if (
    plan.phoneAgentIds.includes(input.agentId) &&
    (!plan.mailboxAgentIds.includes(input.agentId) ||
      planById(plan.planId)?.catalogFamily === "legacy") &&
    !(await findAgentPhoneLine(input.userId, input.agentId))
  ) {
    return { ...ineligibleIdentity(plan.planId), eligible: true, selectionRequired: true };
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
      const includesPhone = currentPlan.phoneAgentIds.includes(input.agentId);
      const includesEmail = currentPlan.mailboxAgentIds.includes(input.agentId);
      const mailbox = includesEmail
        ? await preparePaidBotMailbox(input.userId, input.agentId)
        : null;

      // Secure tenant-owned phone capacity before creating a managed mailbox.
      // Native phone persistence serializes competing provision/claim requests;
      // losing the last slot must not leave an unpaired mailbox above capacity.
      // A later mailbox failure is retried against this same owned phone line.
      const phone = includesPhone ? await ensurePaidBotPhone(input.userId, input.agentId) : null;
      // Customers choose their number in Phone setup. Background repair may
      // restore an owned line, but must not consume their slot with a random one.
      if (includesPhone && !phone && planById(currentPlan.planId)?.catalogFamily === "legacy") {
        return {
          ...ineligibleIdentity(currentPlan.planId),
          eligible: true,
          selectionRequired: true,
        };
      }
      if (includesEmail) await requireTenantChannel(input.userId, "email");
      const email = mailbox
        ? await ensurePaidBotMailbox(input.userId, input.agentId, agent.name || "Bot", mailbox)
        : null;

      return {
        eligible: true,
        selectionRequired: includesPhone && !phone,
        planId: currentPlan.planId,
        phone: phone?.phoneNumber ?? null,
        email: email?.email ?? null,
        phoneReused: phone?.reused ?? false,
        emailReused: email?.reused ?? false,
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
