/**
 * Deleting a Bot.
 *
 * A Bot owns its training, its workspace chat, its computer tasks, and on paid
 * plans a phone number and a BotBound mailbox. Deletion first holds the Bot so
 * that no new outbound call or identity setup starts for it. It then releases
 * the number at the carrier and the mailbox at AgentMail, so nothing keeps
 * billing, answering, or receiving for a Bot that no longer exists, and removes
 * the Bot in one transaction. Call, text, appointment, and lead history stays
 * with the account; only its link to the Bot is cleared. The released mailbox's
 * email goes with it.
 *
 * Deletion waits while the Bot is working: on a call or wrapping one up,
 * placing an outbound call, running a computer task, or setting up its number
 * or mailbox.
 */
import { and, eq, gt, inArray, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { clearBotDeletionHold, lockBotAdmission, placeBotDeletionHold } from "./bot-deletion-hold";
import { acquireCompanyIdentityMutationLock } from "./company-identity-mutation";
import { CAMPAIGN_STATUS } from "./outbound-status";
import { auditLogger, drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import {
  AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
  hasExactAgentMailManagedScope,
  type AgentMailAccountForManagedErasure,
} from "./agentmail-mail";
import {
  NATIVE_OUTBOUND_IN_FLIGHT_STATES,
  nativeOutboundPlacementLeaseMs,
} from "./voice/openai-outbound-placement";

/** A call runs for at most an hour; older presence was left by a crashed session. */
const LIVE_PRESENCE_WINDOW_MINUTES = 75;
const ACTIVE_COMPUTER_TASK_STATUSES = ["running", "needs_input"] as const;
/** Lead states in which the carrier may be placing or holding a call. */
const LIVE_CARRIER_LEAD_STATUSES = ["Queued", "Dialing", "Connected"] as const;
const PAID_BOT_IDENTITY_JOB_TYPE = "paid_bot_identity_reconcile";
/** The job queue resets a job still running after 30 minutes. */
const RUNNING_JOB_HORIZON_MINUTES = 30;
/** Queued work whose only effect is on the Bot itself. */
const BOT_ONLY_JOB_TYPES = [PAID_BOT_IDENTITY_JOB_TYPE, "adaptive_optimization"];
const NUMBER_ALREADY_RELEASED = "Number not found for this tenant.";
/** Matches Date.prototype.toISOString(), which placement metadata uses. */
const UTC_ISO_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';

export type BotDeletionBlock = "live_call" | "outbound_call" | "computer_task" | "identity_setup";

export const BOT_DELETION_BLOCK_MESSAGES: Record<BotDeletionBlock, string> = {
  live_call: "This Bot is on a call or still wrapping one up. Delete it after the call ends.",
  outbound_call: "This Bot is placing a call. Delete it after the call ends.",
  computer_task: "This Bot is working on a computer task. Stop the task, then delete the Bot.",
  identity_setup: "This Bot's number or mailbox is being set up. Try again in a minute.",
};

export interface BotDeletionPreview {
  name: string;
  phoneNumbers: string[];
  mailboxes: string[];
  blockedBy: BotDeletionBlock | null;
}

export interface BotDeletionResult {
  phoneNumbersReleased: number;
  mailboxesReleased: number;
}

type ManagedMailbox = AgentMailAccountForManagedErasure & {
  id: string;
  refreshToken: string | null;
};

/** Provider calls, injectable so deletion can be exercised without Twilio or AgentMail. */
export interface BotDeletionProviders {
  releaseNumber: (userId: string, phoneNumber: string) => Promise<{ ok: boolean; error?: string }>;
  eraseManagedMailboxes: (mailboxes: readonly ManagedMailbox[]) => Promise<unknown>;
  deleteMailboxWebhooks: (accountId: string) => Promise<void>;
  /** Runs provider work unless the account is being deleted; returns null when refused. */
  withProviderFence: <T>(
    userId: string,
    perform: () => Promise<T>,
  ) => Promise<{ result: T } | null>;
}

const defaultProviders: BotDeletionProviders = {
  async releaseNumber(userId, phoneNumber) {
    const { releaseNativeTenantNumber } = await import("./voice/native-phone-release");
    return releaseNativeTenantNumber(userId, phoneNumber);
  },
  async eraseManagedMailboxes(mailboxes) {
    const { eraseManagedAgentMailInboxesForPurge } = await import("./agentmail-mail");
    return eraseManagedAgentMailInboxesForPurge(mailboxes);
  },
  async deleteMailboxWebhooks(accountId) {
    const { deleteAgentMailWebhooksForAccount } = await import("./agentmail-mail");
    await deleteAgentMailWebhooksForAccount({
      apiKey: AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL,
      accountId,
    });
  },
  async withProviderFence(userId, perform) {
    const { runTenantProviderWorkWithDeletionFence } =
      await import("./tenant-provider-deletion-fence");
    const outcome = await runTenantProviderWorkWithDeletionFence({
      userId,
      operation: "bot_deletion",
      perform,
    });
    return outcome.performed ? { result: outcome.result } : null;
  },
};

type Db = Pick<typeof drizzle, "select" | "execute">;

function rowsOf(result: unknown): unknown[] {
  const rows = (result as { rows?: unknown[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}

async function ownedBot(db: Db, userId: string, agentId: string) {
  const [agent] = await db
    .select({ id: schema.agents.id, name: schema.agents.name })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  return agent ?? null;
}

async function botPhoneNumbers(db: Db, userId: string, agentId: string): Promise<string[]> {
  const rows = await db
    .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
    .from(schema.phoneNumbers)
    .where(and(eq(schema.phoneNumbers.userId, userId), eq(schema.phoneNumbers.agentId, agentId)));
  return rows.map((row) => row.phoneNumber);
}

/** Only BotBound-managed inboxes are released; a mailbox the owner connected stays theirs. */
async function managedMailboxes(db: Db, userId: string, agentId: string) {
  const rows = await db
    .select({
      id: schema.emailAccounts.id,
      provider: schema.emailAccounts.provider,
      emailAddress: schema.emailAccounts.emailAddress,
      accessToken: schema.emailAccounts.accessToken,
      refreshToken: schema.emailAccounts.refreshToken,
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
  return rows.filter((row) => hasExactAgentMailManagedScope(row.oauthGrantedScopes));
}

/** Calls and computer tasks, which break if their Bot disappears mid-way. */
async function findBotWorkBlock(
  db: Db,
  userId: string,
  agentId: string,
): Promise<BotDeletionBlock | null> {
  const [presence] = await db
    .select({ id: schema.signalPresence.id })
    .from(schema.signalPresence)
    .where(
      and(
        eq(schema.signalPresence.userId, userId),
        eq(schema.signalPresence.agentId, agentId),
        gt(
          schema.signalPresence.startedAt,
          sql`now() - make_interval(mins => ${LIVE_PRESENCE_WINDOW_MINUTES})`,
        ),
      ),
    )
    .limit(1);
  if (presence) return "live_call";

  // A phone call stages its post-call digest when it starts. The digest ends
  // the provider call and settles minutes, so it must finish with its Bot.
  const wrapUp = await db.execute(sql`
    SELECT 1
    FROM wireline_jobs j
    JOIN wireline_call_logs c
      ON c.user_id = j.user_id AND c.id::text = j.payload->>'callLogId'
    WHERE j.user_id = ${userId}
      AND j.type = 'post_call_digest'
      AND j.status IN ('pending', 'running')
      AND c.agent_id = ${agentId}
    LIMIT 1
  `);
  if (rowsOf(wrapUp).length) return "live_call";

  // A placement claims its lead before the carrier returns a CallSid, so a
  // claim inside its lease is a call being placed. A pointer left behind by a
  // missed status callback ages out with the same lease.
  const placementWindowSeconds = Math.ceil(nativeOutboundPlacementLeaseMs() / 1_000);
  const [outbound] = await db
    .select({ id: schema.outboundLeads.id })
    .from(schema.outboundLeads)
    .where(
      and(
        eq(schema.outboundLeads.userId, userId),
        eq(schema.outboundLeads.agentId, agentId),
        inArray(schema.outboundLeads.status, [...LIVE_CARRIER_LEAD_STATUSES]),
        sql`(${schema.outboundLeads.callId} ~ '^CA[0-9a-fA-F]{32}$'
          OR ${schema.outboundLeads.metadata}->'native_voice'->>'state' IN (${sql.join(
            NATIVE_OUTBOUND_IN_FLIGHT_STATES.map((state) => sql`${state}`),
            sql`, `,
          )}))`,
        sql`COALESCE(
          ${schema.outboundLeads.metadata}->'native_voice'->>'placement_claimed_at',
          to_char(${schema.outboundLeads.lastCalledAt} AT TIME ZONE 'UTC', ${UTC_ISO_FORMAT})
        ) > to_char(
          (now() - make_interval(secs => ${placementWindowSeconds})) AT TIME ZONE 'UTC',
          ${UTC_ISO_FORMAT}
        )`,
      ),
    )
    .limit(1);
  if (outbound) return "outbound_call";

  const [task] = await db
    .select({ id: schema.computerTasks.id })
    .from(schema.computerTasks)
    .where(
      and(
        eq(schema.computerTasks.userId, userId),
        eq(schema.computerTasks.agentId, agentId),
        inArray(schema.computerTasks.status, [...ACTIVE_COMPUTER_TASK_STATUSES]),
      ),
    )
    .limit(1);
  return task ? "computer_task" : null;
}

export async function findBotDeletionBlock(
  db: Db,
  userId: string,
  agentId: string,
): Promise<BotDeletionBlock | null> {
  const work = await findBotWorkBlock(db, userId, agentId);
  if (work) return work;

  // A running setup can recreate the mailbox deletion releases.
  const [setup] = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.userId, userId),
        eq(schema.jobs.type, PAID_BOT_IDENTITY_JOB_TYPE),
        eq(schema.jobs.status, "running"),
        sql`${schema.jobs.payload}->>'agentId' = ${agentId}`,
        gt(
          schema.jobs.startedAt,
          sql`now() - make_interval(mins => ${RUNNING_JOB_HORIZON_MINUTES})`,
        ),
      ),
    )
    .limit(1);
  return setup ? "identity_setup" : null;
}

function busy(block: BotDeletionBlock): AppError {
  return new AppError(409, "BOT_BUSY", BOT_DELETION_BLOCK_MESSAGES[block], { blocked_by: block });
}

/** Busy after the release already happened: say so, since deleting again finishes the job. */
function busyAfterRelease(block: BotDeletionBlock, numbers: number, mailboxes: number): AppError {
  const released = [numbers ? "number" : "", mailboxes ? "mailbox" : ""].filter(Boolean);
  const note = released.length
    ? ` Its ${released.join(" and ")} ${released.length > 1 ? "were" : "was"} already released.`
    : "";
  return new AppError(409, "BOT_BUSY", `${BOT_DELETION_BLOCK_MESSAGES[block]}${note}`, {
    blocked_by: block,
  });
}

/** True when the Bot has a number, or a mailbox other than the ones just released. */
async function identityChangedSinceRelease(
  db: Db,
  userId: string,
  agentId: string,
  released: readonly ManagedMailbox[],
): Promise<boolean> {
  if ((await botPhoneNumbers(db, userId, agentId)).length) return true;
  const releasedById = new Map(released.map((mailbox) => [mailbox.id, mailbox]));
  return (await managedMailboxes(db, userId, agentId)).some((mailbox) => {
    const before = releasedById.get(mailbox.id);
    // Setup rewrites these when it recreates an inbox or its webhook.
    return (
      !before ||
      before.emailAddress !== mailbox.emailAddress ||
      before.accessToken !== mailbox.accessToken ||
      before.refreshToken !== mailbox.refreshToken
    );
  });
}

export async function previewBotDeletion(
  userId: string,
  agentId: string,
  db: Db = drizzle,
): Promise<BotDeletionPreview> {
  const agent = await ownedBot(db, userId, agentId);
  if (!agent) throw AppError.notFound("Bot not found");
  const phoneNumbers = await botPhoneNumbers(db, userId, agentId);
  const mailboxes = await managedMailboxes(db, userId, agentId);
  const blockedBy = await findBotDeletionBlock(db, userId, agentId);
  return {
    name: agent.name,
    phoneNumbers,
    mailboxes: mailboxes.map((mailbox) => mailbox.emailAddress),
    blockedBy,
  };
}

async function releaseBotIdentity(
  db: Db,
  userId: string,
  agentId: string,
  providers: BotDeletionProviders,
): Promise<{ phoneNumbers: number; mailboxes: ManagedMailbox[] }> {
  const released = await providers.withProviderFence(userId, async () => {
    const phoneNumbers = await botPhoneNumbers(db, userId, agentId);
    for (const phoneNumber of phoneNumbers) {
      const outcome = await providers.releaseNumber(userId, phoneNumber);
      if (!outcome.ok && outcome.error !== NUMBER_ALREADY_RELEASED) {
        log.warn("Bot deletion stopped at number release", {
          userId,
          agentId,
          phoneSuffix: phoneNumber.slice(-4),
          error: outcome.error,
        });
        throw new AppError(
          502,
          "NUMBER_RELEASE_FAILED",
          "The carrier didn't confirm releasing this Bot's number, so the Bot was not deleted. Try again in a few minutes.",
        );
      }
    }

    const mailboxes = await managedMailboxes(db, userId, agentId);
    try {
      if (mailboxes.length) await providers.eraseManagedMailboxes(mailboxes);
      for (const mailbox of mailboxes) await providers.deleteMailboxWebhooks(mailbox.id);
    } catch (error) {
      log.warn("Bot deletion stopped at mailbox release", {
        userId,
        agentId,
        error: getErrorMessage(error),
      });
      throw new AppError(
        502,
        "MAILBOX_RELEASE_FAILED",
        "BotBound couldn't release this Bot's mailbox, so the Bot was not deleted. Try again in a few minutes.",
      );
    }
    return { phoneNumbers: phoneNumbers.length, mailboxes };
  });
  if (!released) {
    throw new AppError(
      409,
      "ACCOUNT_DELETION_IN_PROGRESS",
      "This account is being deleted, and its Bots are removed with it.",
    );
  }
  return released.result;
}

export async function deleteBot(
  input: { userId: string; agentId: string; ip?: string },
  providers: BotDeletionProviders = defaultProviders,
  db: typeof drizzle = drizzle,
): Promise<BotDeletionResult> {
  const { userId, agentId } = input;
  const agent = await ownedBot(db, userId, agentId);
  if (!agent) throw AppError.notFound("Bot not found");

  // Hold the Bot before releasing anything. Call placement and identity setup
  // take this lock to start, so anything already started is found here and
  // anything later sees the hold and stops.
  const holdId = await db.transaction(async (tx) => {
    await lockBotAdmission(tx, agentId, "exclusive");
    const blocked = await findBotDeletionBlock(tx, userId, agentId);
    if (blocked) throw busy(blocked);
    return placeBotDeletionHold(tx, userId, agentId);
  });
  if (!holdId) {
    throw new AppError(409, "BOT_DELETION_IN_PROGRESS", "This Bot is already being deleted.");
  }

  let released: { phoneNumbers: number; mailboxes: ManagedMailbox[] };
  try {
    released = await releaseBotIdentity(db, userId, agentId, providers);
    const { phoneNumbers, mailboxes } = released;
    const mailboxIds = mailboxes.map((mailbox) => mailbox.id);

    await db.transaction(async (tx) => {
      // Bot creation takes the account lock and number or mailbox provisioning
      // takes the identity lock. Holding both keeps anything from giving this Bot
      // a new number or mailbox between the releases above and the delete below.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
      await acquireCompanyIdentityMutationLock(tx, userId);

      if (!(await ownedBot(tx, userId, agentId))) throw AppError.notFound("Bot not found");
      // The hold stops calls this Bot places, not calls it receives: a caller
      // can still reach the number until the carrier releases it.
      const busyNow = await findBotWorkBlock(tx, userId, agentId);
      if (busyNow) throw busyAfterRelease(busyNow, phoneNumbers, mailboxIds.length);
      if (await identityChangedSinceRelease(tx, userId, agentId, mailboxes)) {
        throw new AppError(
          409,
          "BOT_IDENTITY_CHANGED",
          "This Bot got a new number or mailbox while it was being deleted. Try again.",
        );
      }

      // The released inbox's email threads cascade from its account row.
      if (mailboxIds.length) {
        await tx
          .delete(schema.emailAccounts)
          .where(
            and(
              eq(schema.emailAccounts.userId, userId),
              inArray(schema.emailAccounts.id, mailboxIds),
            ),
          );
      }

      // History stays with the account. These references have no ON DELETE rule.
      await tx
        .update(schema.callLogs)
        .set({ agentId: null })
        .where(and(eq(schema.callLogs.userId, userId), eq(schema.callLogs.agentId, agentId)));
      await tx
        .update(schema.appointments)
        .set({ agentId: null })
        .where(
          and(eq(schema.appointments.userId, userId), eq(schema.appointments.agentId, agentId)),
        );
      await tx
        .update(schema.followUpTasks)
        .set({ agentId: null })
        .where(
          and(eq(schema.followUpTasks.userId, userId), eq(schema.followUpTasks.agentId, agentId)),
        );
      await tx
        .update(schema.outboundLeads)
        .set({ agentId: null })
        .where(
          and(eq(schema.outboundLeads.userId, userId), eq(schema.outboundLeads.agentId, agentId)),
        );
      await tx
        .update(schema.smsMessages)
        .set({ agentId: null })
        .where(and(eq(schema.smsMessages.userId, userId), eq(schema.smsMessages.agentId, agentId)));
      await tx
        .update(schema.recapArtifacts)
        .set({ agentId: null })
        .where(
          and(eq(schema.recapArtifacts.userId, userId), eq(schema.recapArtifacts.agentId, agentId)),
        );
      // No live call remains (checked above), so any presence row is a crashed session's.
      await tx
        .delete(schema.signalPresence)
        .where(
          and(eq(schema.signalPresence.userId, userId), eq(schema.signalPresence.agentId, agentId)),
        );

      // Outbound work cannot continue without its Bot.
      await tx
        .update(schema.cadences)
        .set({ active: false, agentId: null })
        .where(and(eq(schema.cadences.userId, userId), eq(schema.cadences.agentId, agentId)));
      await tx
        .update(schema.outboundCampaigns)
        .set({ status: CAMPAIGN_STATUS.PAUSED })
        .where(
          and(
            eq(schema.outboundCampaigns.userId, userId),
            eq(schema.outboundCampaigns.agentId, agentId),
            inArray(schema.outboundCampaigns.status, [
              CAMPAIGN_STATUS.QUEUED,
              CAMPAIGN_STATUS.RUNNING,
            ]),
          ),
        );
      await tx
        .update(schema.intakeKeys)
        .set({ defaultAgentId: null })
        .where(
          and(eq(schema.intakeKeys.userId, userId), eq(schema.intakeKeys.defaultAgentId, agentId)),
        );
      await tx
        .update(schema.settings)
        .set({ vapiPhoneInboundAgentId: null })
        .where(
          and(
            eq(schema.settings.userId, userId),
            eq(schema.settings.vapiPhoneInboundAgentId, agentId),
          ),
        );
      // Queued identity repair and tuning for this Bot would fail on every retry
      // once it is gone, after spending provider calls.
      await tx
        .delete(schema.jobs)
        .where(
          and(
            eq(schema.jobs.userId, userId),
            inArray(schema.jobs.type, BOT_ONLY_JOB_TYPES),
            inArray(schema.jobs.status, ["pending", "failed"]),
            sql`${schema.jobs.payload}->>'agentId' = ${agentId}`,
          ),
        );

      await clearBotDeletionHold(tx, userId, holdId);
      // Training, lessons, workspace chat, and computer tasks cascade from the Bot.
      await tx
        .delete(schema.agents)
        .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)));
    });
  } catch (error) {
    await clearBotDeletionHold(db, userId, holdId).catch((clearError: unknown) =>
      log.warn("Bot deletion hold left to expire", {
        userId,
        agentId,
        error: getErrorMessage(clearError),
      }),
    );
    throw error;
  }

  const result = {
    phoneNumbersReleased: released.phoneNumbers,
    mailboxesReleased: released.mailboxes.length,
  };
  await auditLogger.logAgentOperation("deleted", {
    userId,
    agentId,
    agentName: agent.name,
    metadata: {
      phone_numbers_released: result.phoneNumbersReleased,
      mailboxes_released: result.mailboxesReleased,
    },
    ip: input.ip,
  });
  return result;
}
