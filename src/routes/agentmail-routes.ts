import { Router, Response } from "express";
import { and, eq } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { validateBody, agentmailConnectSchema } from "../lib/api-validation";
import {
  AGENTMAIL_API_BASE,
  AGENTMAIL_FREE_DOMAIN,
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
  AgentMailConnectError,
  agentmailGrantedScopes,
  deleteAgentMailWebhook,
  deleteAgentMailWebhooksForAccount,
  ensureAgentMailWebhook,
  listAgentMailInboxes,
  listAgentMailWebhooks,
  normalizeAgentMailInbox,
  resolveAgentMailInbox,
  verifyAgentMailCredentials,
} from "../lib/agentmail-mail";
import {
  EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE,
  upsertOwnedEmailAccount,
} from "../lib/owned-email-account";
import { drizzle, fetchWithTimeout, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { encryptSecret, decryptSecret, isVaultConfigured } from "../lib/secret-vault";
import { authenticateUser } from "../middleware/auth";
import { createRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import * as schema from "../db/schema";

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
  return /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(value) && value.includes(".")
    ? value
    : null;
}

function managedMailboxUsername(agentName: string, agentId: string): string {
  const suffix = agentId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(-8) || "bot";
  const base = agentName
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
  domain?: string;
  agentId: string;
  agentName: string;
}): Promise<{ inboxId: string; email: string }> {
  const clientId = `botbound-agent:${input.agentId}:${input.domain || AGENTMAIL_FREE_DOMAIN}`;
  const response = await fetchWithTimeout(`${AGENTMAIL_API_BASE}/inboxes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: input.username,
      ...(input.domain ? { domain: input.domain } : {}),
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
    throw new AgentMailConnectError("BotBound managed email credentials were rejected by AgentMail.");
  }
  if (!response.ok) {
    throw new AgentMailConnectError(
      input.domain
        ? `AgentMail could not create a mailbox on ${input.domain}.`
        : "AgentMail could not create the managed Bot mailbox.",
    );
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
}): Promise<{ inboxId: string; email: string; usedCustomDomain: boolean }> {
  const username = managedMailboxUsername(input.agentName, input.agentId);
  const preferredDomain = managedMailboxDomain();
  const preferredEmail = `${username}@${preferredDomain || AGENTMAIL_FREE_DOMAIN}`;
  const fallbackEmail = `${username}@${AGENTMAIL_FREE_DOMAIN}`;
  const existing = await listAgentMailInboxes(input.apiKey);
  const current = existing.find(
    (inbox) => inbox.email === preferredEmail || (!preferredDomain && inbox.email === fallbackEmail),
  );
  if (current) {
    return {
      ...current,
      usedCustomDomain: Boolean(preferredDomain && current.email.endsWith(`@${preferredDomain}`)),
    };
  }

  if (preferredDomain && preferredDomain !== AGENTMAIL_FREE_DOMAIN) {
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

  const inbox = await createManagedInboxAttempt({ ...input, username });
  return { ...inbox, usedCustomDomain: false };
}

/**
 * POST /api/agents/:agentId/managed-mailbox
 *
 * Platform-managed Bot identity. New users should never need to know AgentMail
 * exists: BotBound provisions the mailbox, binds it to the Bot, and registers
 * delivery push. A verified AGENTMAIL_DEFAULT_DOMAIN is preferred when present;
 * if a custom domain is configured but not ready, provisioning fails closed
 * instead of silently degrading to a provider-branded address.
 */
router.post(
  "/api/agents/:agentId/managed-mailbox",
  authenticateUser,
  managedMailboxRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!isVaultConfigured()) {
      throw AppError.fromHttpStatus(503, "Managed email is temporarily unavailable.");
    }
    const apiKey = String(process.env.AGENTMAIL_API_KEY || "").replace(/\s+/g, "");
    if (!apiKey) {
      throw AppError.fromHttpStatus(503, "Managed email is temporarily unavailable.");
    }

    const userId = req.user.id;
    const agentId = String(req.params.agentId || "").trim();
    const [agent] = await drizzle
      .select({ id: schema.agents.id, name: schema.agents.name })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
      .limit(1);
    if (!agent) throw AppError.fromHttpStatus(404, "Bot not found.");

    const [existingManaged] = await drizzle
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
      )
      .limit(1);
    if (existingManaged?.oauthGrantedScopes?.includes(MANAGED_SCOPE_MARKER)) {
      res.json({
        ok: true,
        email: existingManaged.emailAddress,
        provider: "agentmail",
        managed: true,
        reused: true,
      });
      return;
    }

    let inbox: Awaited<ReturnType<typeof resolveManagedBotInbox>>;
    try {
      inbox = await resolveManagedBotInbox({ apiKey, agentId, agentName: agent.name || "Bot" });
      await verifyAgentMailCredentials(inbox.email, apiKey);
    } catch (err) {
      log.warn("Managed Bot mailbox provisioning failed", {
        userId,
        agentId,
        error: getErrorMessage(err),
      });
      throw AppError.fromHttpStatus(503, "Managed email is temporarily unavailable.");
    }

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
    if (!connected) {
      throw new AppError(409, "EMAIL_ACCOUNT_IN_USE", EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE);
    }

    await persistAgentMailDeliverySubscription({
      apiKey,
      inboxId: inbox.inboxId,
      accountId: connected.id,
      userId,
      emailAddress: inbox.email,
    });

    res.status(201).json({
      ok: true,
      email: inbox.email,
      provider: "agentmail",
      managed: true,
      custom_domain: inbox.usedCustomDomain,
      reused: false,
    });
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
    if (!isVaultConfigured()) {
      throw AppError.fromHttpStatus(
        503,
        "Credential storage is not configured. Contact support to enable mailbox connections.",
      );
    }

    const userId = req.user.id;
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
        (account) => !account.oauthGrantedScopes?.includes(MANAGED_SCOPE_MARKER),
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
          .where(and(eq(schema.emailAccounts.id, account.id), eq(schema.emailAccounts.userId, userId)));
      }
      res.json({ ok: true, removed: legacyAccounts.length });
    } catch (err) {
      log.error("AgentMail disconnect failed", { userId, error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to disconnect AgentMail");
    }
  },
);

export default router;