import { Router, Response } from "express";
import { and, eq } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { validateBody, agentmailConnectSchema } from "../lib/api-validation";
import {
  AGENTMAIL_API_BASE,
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
  AgentMailConnectError,
  agentmailLocalPart,
  agentmailGrantedScopes,
  deleteAgentMailWebhook,
  deleteAgentMailWebhooksForAccount,
  ensureAgentMailWebhook,
  hasExactAgentMailManagedScope,
  listAgentMailInboxes,
  listAgentMailWebhooks,
  normalizeAgentMailInbox,
  resolveAgentMailInbox,
  verifyAgentMailCredentials,
  verifyManagedAgentMailDomainIdentity,
} from "../lib/agentmail-mail";
import {
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE,
  upsertOwnedEmailAccount,
} from "../lib/owned-email-account";
import { drizzle, fetchWithTimeout, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import {
  assertTwilioOwnedNumber,
  ensurePaidBotIdentity,
  getPaidBotIdentityAgentIds,
} from "../lib/paid-bot-identity";
import { encryptSecret, decryptSecret, isVaultConfigured } from "../lib/secret-vault";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import * as schema from "../db/schema";
import { assertLiveExternalActionAllowed } from "../lib/account-environment-policy";
import { runTenantProviderWorkWithDeletionFence } from "../lib/tenant-provider-deletion-fence";
import {
  existingManagedEmailDomain,
  isBotBoundManagedEmailDomain,
} from "../lib/managed-agentmail-domain";

const router = Router();
const MANAGED_SCOPE_MARKER = "managed-botbound";

const agentmailConnectRateLimiter = createRateLimiter({
  bucket: "api:agentmail-connect",
  windowMs: 15 * 60 * 1000,
  max: 20,
});

const managedMailboxRateLimiter = createRateLimiter({
  bucket: "api:agentmail-managed-mailbox",
  windowMs: 15 * 60 * 1000,
  max: 30,
});

async function removeUnverifiableAgentMailWebhook(input: {
  apiKey: string;
  webhookId: string;
  userId: string;
  emailAddress: string;
}): Promise<void> {
  try {
    await deleteAgentMailWebhook(input.apiKey, input.webhookId);
  } catch (cleanupError) {
    log.warn("AgentMail orphan webhook cleanup failed", {
      userId: input.userId,
      email: input.emailAddress,
      webhookId: input.webhookId,
      error: getErrorMessage(cleanupError),
    });
  }
}

async function persistAgentMailDeliverySubscription(input: {
  apiKey: string;
  inboxId: string;
  accountId: string;
  userId: string;
  emailAddress: string;
}): Promise<void> {
  try {
    const [stored] = await drizzle
      .select({ refreshToken: schema.emailAccounts.refreshToken })
      .from(schema.emailAccounts)
      .where(eq(schema.emailAccounts.id, input.accountId))
      .limit(1);
    const ensured = await ensureAgentMailWebhook({
      apiKey: input.apiKey,
      inboxId: input.inboxId,
      accountId: input.accountId,
      hasStoredSecret: Boolean(stored?.refreshToken),
    });
    if (!ensured) return;

    // AgentMail may not re-expose a signing secret when an existing webhook is
    // already valid. In that case the encrypted stored secret is authoritative.
    if (!ensured.secret && stored?.refreshToken) return;

    try {
      let signingSecret = ensured.secret;
      if (!signingSecret) {
        const webhooks = await listAgentMailWebhooks(input.apiKey);
        signingSecret =
          webhooks.find((webhook) => webhook.webhookId === ensured.webhookId)?.secret ?? null;
      }
      if (!signingSecret) {
        throw new Error("AgentMail webhook did not expose its signing secret");
      }

      const persisted = await drizzle
        .update(schema.emailAccounts)
        .set({ refreshToken: encryptSecret(signingSecret) })
        .where(
          and(
            eq(schema.emailAccounts.id, input.accountId),
            eq(schema.emailAccounts.userId, input.userId),
          ),
        )
        .returning({ id: schema.emailAccounts.id });
      if (persisted.length !== 1) {
        throw new Error("AgentMail signing secret was not stored on the mailbox account");
      }
    } catch (signingSecretError) {
      await removeUnverifiableAgentMailWebhook({
        apiKey: input.apiKey,
        webhookId: ensured.webhookId,
        userId: input.userId,
        emailAddress: input.emailAddress,
      });
      throw signingSecretError;
    }
  } catch (err) {
    // IMAP remains a durable fallback when push registration is unavailable.
    log.warn("AgentMail delivery subscription skipped", {
      userId: input.userId,
      email: input.emailAddress,
      error: getErrorMessage(err),
    });
  }
}

function managedMailboxDomain(): string | null {
  const value = String(process.env.AGENTMAIL_DEFAULT_DOMAIN || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
  if (!value) return null;
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(value) || !value.includes(".")) {
    return null;
  }
  return isBotBoundManagedEmailDomain(value) ? value : null;
}

async function hasManagedMailboxEntitlement(userId: string, agentId: string): Promise<boolean> {
  if (!(await getPaidBotIdentityAgentIds(userId)).includes(agentId)) return false;
  const [line] = await drizzle
    .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
    .from(schema.phoneNumbers)
    .where(and(eq(schema.phoneNumbers.userId, userId), eq(schema.phoneNumbers.agentId, agentId)))
    .limit(1);
  if (!line?.phoneNumber) return false;
  await assertTwilioOwnedNumber(line.phoneNumber);
  return true;
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

async function createManagedInboxAttempt(input: {
  apiKey: string;
  username: string;
  domain: string;
  agentId: string;
  agentName: string;
}): Promise<{ inboxId: string; email: string }> {
  const clientId = `botbound-agent:${input.agentId}:${input.domain}`;
  const response = await fetchWithTimeout(`${AGENTMAIL_API_BASE}/inboxes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: input.username,
      domain: input.domain,
      display_name: input.agentName,
      client_id: clientId,
      metadata: {
        platform: "BotBound",
        agent_id: input.agentId,
        managed: "true",
      },
    }),
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }
  if (response.status === 401 || response.status === 403) {
    throw new AgentMailConnectError(
      "BotBound managed email credentials were rejected by AgentMail.",
    );
  }
  if (!response.ok) {
    throw new AgentMailConnectError(`AgentMail could not create a mailbox on ${input.domain}.`);
  }
  const row = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const created = normalizeAgentMailInbox(body) ?? normalizeAgentMailInbox(row?.inbox);
  if (!created) {
    throw new AgentMailConnectError("AgentMail created a mailbox but did not return its address.");
  }
  return created;
}

async function resolveManagedBotInbox(input: {
  apiKey: string;
  agentId: string;
  agentName: string;
  domain: string;
  reservedEmailAddress?: string;
}): Promise<{ inboxId: string; email: string; usedCustomDomain: boolean }> {
  const preferredDomain = input.domain;
  if (!preferredDomain) {
    throw new AgentMailConnectError("BotBound managed email domain is not ready.");
  }
  const reservedEmailAddress = input.reservedEmailAddress?.trim().toLowerCase();
  const preferredEmail =
    reservedEmailAddress ??
    `${managedMailboxUsername(input.agentName, input.agentId)}@${preferredDomain}`;
  const username = agentmailLocalPart(preferredEmail);
  if (!username || !preferredEmail.endsWith(`@${preferredDomain}`)) {
    throw new AgentMailConnectError("The reserved BotBound mailbox address is invalid.");
  }
  const existing = await listAgentMailInboxes(input.apiKey);
  const current = existing.find((inbox) => inbox.email === preferredEmail);
  if (current) {
    return { ...current, usedCustomDomain: true };
  }
  if (!isBotBoundManagedEmailDomain(preferredDomain)) {
    throw new AgentMailConnectError(
      "Existing legacy managed mailbox is missing; restore its identity before reconciliation.",
    );
  }

  try {
    const inbox = await createManagedInboxAttempt({
      ...input,
      username,
      domain: preferredDomain,
    });
    return { ...inbox, usedCustomDomain: true };
  } catch (error) {
    log.warn("Managed AgentMail custom-domain provisioning failed closed", {
      agentId: input.agentId,
      domain: preferredDomain,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

/** One server-owned sequence for automatic web setup and its idempotent retries. */
router.post(
  "/api/agents/:agentId/managed-identity",
  authenticateUser,
  managedMailboxRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    const agentId = String(req.params.agentId || "").trim();
    const [agent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1);
    if (!agent) throw AppError.fromHttpStatus(404, "Bot not found.");

    try {
      const identity = await ensurePaidBotIdentity({ userId, agentId });
      if (!identity.eligible) {
        throw new AppError(
          402,
          "ACTIVATION_REQUIRED",
          "Activate an eligible paid Bot before setting up its phone and email.",
        );
      }
      res.json({
        ok: true,
        phone_number: identity.phone,
        email: identity.email,
        custom_domain: true,
        phone_reused: identity.phoneReused,
        email_reused: identity.emailReused,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.warn("Managed Bot identity setup deferred", {
        userId,
        agentId,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(
        503,
        "Bot phone and email setup is temporarily unavailable. Please try again.",
      );
    }
  },
);

/**
 * POST /api/agents/:agentId/managed-mailbox
 *
 * Platform-managed Bot identity. New users should never need to know AgentMail
 * exists: BotBound provisions the mailbox, binds it to the Bot, and registers
 * delivery push. A paid entitlement and verified BotBound-domain
 * AGENTMAIL_DEFAULT_DOMAIN are mandatory; provider-branded fallback is never a
 * customer-facing identity.
 */
router.post(
  "/api/agents/:agentId/managed-mailbox",
  authenticateUser,
  managedMailboxRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    await assertLiveExternalActionAllowed(userId, "managed_agentmail_mailbox_provision");
    if (!isVaultConfigured()) {
      throw AppError.fromHttpStatus(503, "Managed email is temporarily unavailable.");
    }
    const apiKey = String(process.env.AGENTMAIL_API_KEY || "").replace(/\s+/g, "");
    if (!apiKey) {
      throw AppError.fromHttpStatus(503, "Managed email is temporarily unavailable.");
    }

    const agentId = String(req.params.agentId || "").trim();
    const [agent] = await drizzle
      .select({ id: schema.agents.id, name: schema.agents.name })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1);
    if (!agent) throw AppError.fromHttpStatus(404, "Bot not found.");
    if (!(await hasManagedMailboxEntitlement(userId, agentId))) {
      throw new AppError(
        402,
        "ACTIVATION_REQUIRED",
        "Activate a paid Bot before provisioning its managed email identity.",
      );
    }
    const agentMailAccounts = await drizzle
      .select({
        id: schema.emailAccounts.id,
        emailAddress: schema.emailAccounts.emailAddress,
        oauthGrantedScopes: schema.emailAccounts.oauthGrantedScopes,
      })
      .from(schema.emailAccounts)
      .where(
        and(
          eq(schema.emailAccounts.userId, userId),
          eq(schema.emailAccounts.agentId, agentId),
          eq(schema.emailAccounts.provider, "agentmail"),
        ),
      );
    const existingManaged = agentMailAccounts.find((account) =>
      hasExactAgentMailManagedScope(account.oauthGrantedScopes),
    );
    const requiredDomain = existingManaged
      ? existingManagedEmailDomain(existingManaged.emailAddress)
      : managedMailboxDomain();
    if (!requiredDomain) {
      throw AppError.fromHttpStatus(503, "Managed email is temporarily unavailable.");
    }
    const provisioned = await runTenantProviderWorkWithDeletionFence({
      userId,
      operation: "managed_agentmail_mailbox_provision",
      // A successful reconciliation/create reached AgentMail. Keep the lease
      // through its crash horizon so terminal purge cannot erase the only
      // pointer while an accepted provider or webhook outcome is still
      // settling. Thrown/ambiguous outcomes are retained by the fence itself.
      retainOnSuccess: true,
      perform: async (): Promise<{ status: number; body: Record<string, unknown> }> => {
        // Compatibility mailbox requests cannot bypass the shared paid roster,
        // serialized phone ownership, or a downgrade while waiting for the fence.
        if (!(await hasManagedMailboxEntitlement(userId, agentId))) {
          throw new AppError(
            402,
            "ACTIVATION_REQUIRED",
            "Activate a paid Bot phone line before setting up its managed email.",
          );
        }
        await verifyManagedAgentMailDomainIdentity(apiKey, undefined, requiredDomain);
        if (existingManaged) {
          if (!existingManaged.emailAddress.toLowerCase().endsWith(`@${requiredDomain}`)) {
            throw AppError.fromHttpStatus(503, "Managed email is temporarily unavailable.");
          }
          try {
            const inbox = await resolveManagedBotInbox({
              apiKey,
              agentId,
              agentName: agent.name || "Bot",
              domain: requiredDomain,
              reservedEmailAddress: existingManaged.emailAddress,
            });
            await verifyAgentMailCredentials(inbox.email, apiKey);
            await persistAgentMailDeliverySubscription({
              apiKey,
              inboxId: inbox.inboxId,
              accountId: existingManaged.id,
              userId,
              emailAddress: existingManaged.emailAddress,
            });
          } catch (err) {
            log.warn("Existing managed Bot mailbox reconciliation failed", {
              userId,
              agentId,
              email: existingManaged.emailAddress,
              error: getErrorMessage(err),
            });
            throw AppError.fromHttpStatus(503, "Managed email is temporarily unavailable.");
          }
          return {
            status: 200,
            body: {
              ok: true,
              email: existingManaged.emailAddress,
              provider: "agentmail",
              managed: true,
              reused: true,
            },
          };
        }

        // Reserve the exact provider address inside the same deletion lease as
        // the first external create and every evidence postwrite. If AgentMail
        // succeeds but verification, parsing, or a later write fails, terminal
        // erasure and the next retry retain an authoritative pointer.
        const reservedEmailAddress = `${managedMailboxUsername(
          agent.name || "Bot",
          agentId,
        )}@${requiredDomain}`;
        const connected = await upsertOwnedEmailAccount({
          userId,
          agentId,
          emailAddress: reservedEmailAddress,
          provider: "agentmail",
          accessToken: encryptSecret(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL),
          refreshToken: null,
          expiresAt: null,
          oauthGrantedScopes: `${agentmailGrantedScopes()} ${MANAGED_SCOPE_MARKER}`,
        });
        if (!connected) {
          throw new AppError(409, "EMAIL_ACCOUNT_IN_USE", EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE);
        }

        let inbox: Awaited<ReturnType<typeof resolveManagedBotInbox>>;
        try {
          inbox = await resolveManagedBotInbox({
            apiKey,
            agentId,
            agentName: agent.name || "Bot",
            domain: requiredDomain,
            reservedEmailAddress,
          });
          await verifyAgentMailCredentials(inbox.email, apiKey);
        } catch (err) {
          log.warn("Managed Bot mailbox provisioning failed", {
            userId,
            agentId,
            error: getErrorMessage(err),
          });
          throw AppError.fromHttpStatus(503, "Managed email is temporarily unavailable.");
        }

        await persistAgentMailDeliverySubscription({
          apiKey,
          inboxId: inbox.inboxId,
          accountId: connected.id,
          userId,
          emailAddress: reservedEmailAddress,
        });

        return {
          status: 201,
          body: {
            ok: true,
            email: reservedEmailAddress,
            provider: "agentmail",
            managed: true,
            custom_domain: inbox.usedCustomDomain,
            reused: false,
          },
        };
      },
    });
    if (!provisioned.performed) {
      throw new AppError(
        409,
        "ACCOUNT_DELETION_IN_PROGRESS",
        "Managed email cannot be provisioned while account deletion is in progress.",
      );
    }
    res.status(provisioned.result.status).json(provisioned.result.body);
  },
);

/**
 * POST /api/integrations/agentmail/connect
 *
 * Legacy/advanced compatibility path for tenant-owned AgentMail orgs. New Bots
 * use the managed-mailbox route above and do not require users to configure
 * AgentMail in Connections.
 */
router.post(
  "/api/integrations/agentmail/connect",
  authenticateUser,
  agentmailConnectRateLimiter,
  validateBody(agentmailConnectSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    await assertLiveExternalActionAllowed(userId, "agentmail_mailbox_connect");
    if (!isVaultConfigured()) {
      throw AppError.fromHttpStatus(
        503,
        "Credential storage is not configured. Contact support to enable mailbox connections.",
      );
    }

    const requestedEmail = req.body.email_address.trim().toLowerCase();
    const apiKey = req.body.api_key.replace(/\s+/g, "");

    let emailAddress = requestedEmail;
    let inboxId = requestedEmail;
    try {
      const inbox = await resolveAgentMailInbox(apiKey, requestedEmail);
      emailAddress = inbox.email;
      inboxId = inbox.inboxId;
      await verifyAgentMailCredentials(emailAddress, apiKey);
    } catch (err) {
      log.warn("AgentMail mailbox connection failed", {
        userId,
        email: requestedEmail,
        error: getErrorMessage(err),
      });
      if (err instanceof AgentMailConnectError) {
        throw AppError.fromHttpStatus(400, err.message);
      }
      throw AppError.fromHttpStatus(
        400,
        "Could not sign in to that AgentMail inbox. Check the address and API key.",
      );
    }

    const emailAccountConnected = await upsertOwnedEmailAccount({
      userId,
      emailAddress,
      provider: "agentmail",
      accessToken: encryptSecret(apiKey),
      refreshToken: null,
      expiresAt: null,
      oauthGrantedScopes: agentmailGrantedScopes(),
    });
    if (!emailAccountConnected) {
      throw new AppError(409, "EMAIL_ACCOUNT_IN_USE", EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE);
    }

    await persistAgentMailDeliverySubscription({
      apiKey,
      inboxId,
      accountId: emailAccountConnected.id,
      userId,
      emailAddress,
    });

    res.json({ ok: true, email: emailAddress, provider: "agentmail" });
  },
);

router.post(
  "/api/integrations/agentmail/disconnect",
  authenticateUser,
  agentmailConnectRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    try {
      const accounts = await drizzle
        .select({
          id: schema.emailAccounts.id,
          accessToken: schema.emailAccounts.accessToken,
          oauthGrantedScopes: schema.emailAccounts.oauthGrantedScopes,
        })
        .from(schema.emailAccounts)
        .where(
          and(
            eq(schema.emailAccounts.userId, userId),
            eq(schema.emailAccounts.provider, "agentmail"),
          ),
        );
      const legacyAccounts = accounts.filter(
        (account) => !hasExactAgentMailManagedScope(account.oauthGrantedScopes),
      );
      for (const account of legacyAccounts) {
        if (account.accessToken) {
          try {
            await deleteAgentMailWebhooksForAccount({
              apiKey: decryptSecret(account.accessToken),
              accountId: account.id,
            });
          } catch (err) {
            log.warn("AgentMail delivery subscription cleanup skipped", {
              userId,
              error: getErrorMessage(err),
            });
          }
        }
        await drizzle
          .delete(schema.emailAccounts)
          .where(
            and(eq(schema.emailAccounts.id, account.id), eq(schema.emailAccounts.userId, userId)),
          );
      }
      res.json({ ok: true, removed: legacyAccounts.length });
    } catch (err) {
      log.error("AgentMail disconnect failed", { userId, error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to disconnect AgentMail");
    }
  },
);

export default router;
