/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import type { AuthenticatedRequest } from "../types/auth";
import { drizzle, log, auditLogger, serialQueryBatch } from "../lib/server-context";
import { settings, userPreferences, agents, callLogs, deletionQueue } from "../db/schema";
import * as schema from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, mapObjectToCamel, mapObjectToSnake } from "../lib/server-utils";
import { isOwnerEmail } from "../lib/auth-service";
import { isPlatformAdmin } from "../middleware/platform-admin";
import { enqueue } from "../lib/job-queue";
import { jobsRateLimit, userPreferencesRateLimit } from "../middleware/api-rate-limits";
import { ACCOUNT_DELETION_GRACE_DAYS, computeScheduledPurgeAt } from "../lib/account-deletion";
import {
  resumeRenewalAfterDeletionCancellation,
  stopRenewalForDeletion,
} from "../lib/account-deletion-billing";
import { validate } from "../middleware/validate";
import { SettingsSchema } from "../../contracts/api-types";

const router = Router();

/**
 * Client-writable settings columns (camelCase after mapObjectToCamel).
 * Anything not listed here is server-owned — billing entitlements, trial
 * counters, activation metrics, acquisition provenance, provider secrets.
 */
const CLIENT_WRITABLE_SETTINGS = new Set([
  "vapiPhoneNumberId",
  "vapiPhoneInboundAgentId",
  "retentionDays",
  "voiceLlmProvider",
  "voiceLlmModel",
  "dailyBriefEnabled",
  "dailyBriefSendAt",
  "dailyBriefRecipient",
  "businessName",
  "businessType",
  "primaryProduct",
  "businessHours",
  "crmType",
  "twilioMessagingEnabled",
  "twilioLookupEnabled",
  "twilioManagerAlertsEnabled",
  "twilioMessagingServiceSid",
  "twilioSmsFromNumber",
  "twilioWhatsappFromNumber",
  "twilioManagerAlertNumber",
  "handoffPhone",
  "prospectingEnabled",
  "targetTitles",
  "targetIndustries",
  "targetStates",
  "targetEmployeeRanges",
  "brandName",
  "brandLogoUrl",
  "primaryColor",
  "autonomyLevel",
  "csatSmsEnabled",
]);

/** Platform-admin-only capacity fields — never via Stripe-bypass self-service. */
const ADMIN_WRITABLE_SETTINGS = new Set(["subscriptionStatus", "maxAgents", "extraAgents"]);

/**
 * Retention bounds published in `docs/SLA.md`: "default 365 days, minimum 90
 * days". `retentionDays` is client-writable and drives the purge job that
 * irreversibly deletes call logs, transcripts, and outcomes — but nothing
 * bounded it, so a PATCH of `{"retentionDays": 1}` (or 0, or a negative) was
 * accepted verbatim and the next purge would destroy a tenant's history far
 * inside the window their SLA promises. Clamping rather than rejecting keeps a
 * fat-fingered settings save from 400-ing the whole form, and the floor is the
 * side that matters: over-retaining is a storage cost, under-retaining is
 * unrecoverable data loss against a written commitment.
 */
const RETENTION_DAYS_MIN = 90;
const RETENTION_DAYS_MAX = 365;

function clampRetentionDays(value: unknown): number | undefined {
  // null / undefined / "" are "leave it alone", not zero. Number(null) is 0,
  // which would clamp an explicit clear up to the 90-day FLOOR and silently
  // shorten a tenant sitting on the 365-day default.
  if (value === null || value === undefined || value === "") return undefined;
  const days = Math.trunc(Number(value));
  if (!Number.isFinite(days)) return undefined;
  return Math.min(RETENTION_DAYS_MAX, Math.max(RETENTION_DAYS_MIN, days));
}

export function pickWritableSettings(
  update: Record<string, unknown>,
  isAccountHolder: boolean,
): Record<string, unknown> {
  const allowed = isAccountHolder
    ? new Set([...CLIENT_WRITABLE_SETTINGS, ...ADMIN_WRITABLE_SETTINGS])
    : CLIENT_WRITABLE_SETTINGS;
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(update)) {
    if (!allowed.has(key)) continue;
    if (key === "retentionDays") {
      const clamped = clampRetentionDays(value);
      // A non-numeric retention is dropped, not stored: leaving the existing
      // value alone is safer than writing NaN into the purge window.
      if (clamped !== undefined) filtered[key] = clamped;
      continue;
    }
    filtered[key] = value;
  }
  return filtered;
}

router.get("/api/settings", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [data] = await drizzle
      .select()
      .from(settings)
      .where(eq(settings.userId, req.user.id))
      .limit(1);

    // Strip sensitive credentials — return boolean presence flags instead.
    // The raw key is never needed by the browser; only server-side code
    // uses it (and reads from process.env.VAPI_PRIVATE_KEY, not this column).
    const safe = data ? { ...data } : ({} as any);
    if (isOwnerEmail(req.user.email)) {
      safe.subscriptionStatus = "active";
      safe.maxAgents = null;
      safe.extraAgents = 0;
      safe.founderUnlimitedAgents = true;
    }
    if ("vapiPrivateKey" in safe) {
      // Managed Vapi: the runtime reads process.env.VAPI_PRIVATE_KEY, not the
      // tenant column (which stays null for normal workspaces). Report platform
      // voice readiness so clients do not think voice is unconfigured.
      safe.has_vapi_key = Boolean(process.env.VAPI_PRIVATE_KEY?.trim());
      delete safe.vapiPrivateKey;
    }

    const snakeSafe = mapObjectToSnake(safe);
    res.json({ ...snakeSafe, settings: snakeSafe });
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error("Failed to fetch settings", { error: getErrorMessage(error) });
    throw AppError.fromHttpStatus(500, "Failed to load settings");
  }
});

/**
 * The tenant-wide telecom identity fields are client-writable, but every
 * tenant's line lives in ONE shared Vapi account and ONE shared Twilio account.
 * Format validation alone is therefore not a boundary: another workspace's real
 * number passes E.164 and its Vapi id passes the id shape, and the provider
 * accepts both because the platform credential owns them.
 *
 * Left unchecked, writing a neighbour's identifier here is enough to place
 * outbound calls under their caller ID (resolveAgentVapiPhoneNumberId falls
 * back to this column when an agent has no dedicated line) and to send SMS
 * from their business number — landing the carrier spam reports, STIR/SHAKEN
 * reputation damage, and TCPA exposure on a workspace that never sent anything.
 * A number may only be claimed as a tenant identity if that tenant owns the row.
 */
export async function assertTelecomIdentityOwned(
  userId: string,
  update: Record<string, unknown>,
): Promise<void> {
  const vapiId =
    typeof update.vapiPhoneNumberId === "string" ? update.vapiPhoneNumberId.trim() : "";
  const smsFrom =
    typeof update.twilioSmsFromNumber === "string" ? update.twilioSmsFromNumber.trim() : "";
  // The WhatsApp sender is the same shape of shared-credential identity as the
  // SMS from-number and takes precedence in buildMessagePayload — and a
  // competitor's WhatsApp business number is public, so it is the enumerable
  // spoofing vector. Guard it against owned lines exactly like smsFrom.
  const whatsappFrom =
    typeof update.twilioWhatsappFromNumber === "string"
      ? update.twilioWhatsappFromNumber.trim()
      : "";
  if (!vapiId && !smsFrom && !whatsappFrom) return;

  const owned = await drizzle
    .select({
      vapiNumberId: schema.phoneNumbers.vapiNumberId,
      phoneNumber: schema.phoneNumbers.phoneNumber,
    })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, userId));

  if (vapiId && !owned.some((row) => row.vapiNumberId === vapiId)) {
    throw AppError.fromHttpStatus(
      403,
      "That voice line is not provisioned to this workspace. Provision a number before setting it as the default.",
    );
  }
  if (smsFrom && !owned.some((row) => row.phoneNumber === smsFrom)) {
    throw AppError.fromHttpStatus(
      403,
      "That SMS number is not provisioned to this workspace. Provision a number before sending from it.",
    );
  }
  if (whatsappFrom && !owned.some((row) => row.phoneNumber === whatsappFrom)) {
    throw AppError.fromHttpStatus(
      403,
      "That WhatsApp number is not provisioned to this workspace. Provision a number before sending from it.",
    );
  }
}

router.post(
  "/api/settings",
  authenticateUser,
  validate(SettingsSchema.partial()),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const isAccountHolder = await isPlatformAdmin(req.user);
      // Allowlist only — never trust deny-list + passthrough for entitlements
      // (liveVideoAddonEnabled, trialEndsAt, trialOutboundCount, aiTier, …).
      const update = pickWritableSettings(
        mapObjectToCamel(req.body) as Record<string, unknown>,
        isAccountHolder,
      );
      await assertTelecomIdentityOwned(req.user.id, update);
      update.updatedAt = new Date();

      let [data] = (await drizzle
        .update(settings)
        .set(update)
        .where(eq(settings.userId, req.user.id))
        .returning()) as any[];

      // First save for tenants without a settings row yet (e.g. owner bootstrap race).
      if (!data) {
        [data] = (await drizzle
          .insert(settings)
          .values({
            id: req.user.id,
            userId: req.user.id,
            // Match signup (`startTrialForUser`): Free Builder tenants start
            // pending_activation. Never bootstrap a silent `trialing` row —
            // that status bypasses enforceLiveWorkActivation with no expiry.
            subscriptionStatus: isOwnerEmail(req.user.email) ? "active" : "pending_activation",
            ...update,
          })
          .onConflictDoUpdate({
            target: settings.userId,
            set: update,
          })
          .returning()) as any[];
      }

      const safeData = data ? { ...data } : {};
      delete (safeData as any).vapiPrivateKey;
      res.json({ settings: safeData });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Failed to update settings", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to update settings");
    }
  },
);

router.get(
  "/api/user-preferences",
  authenticateUser,
  userPreferencesRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [data] = await drizzle
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, req.user.id))
        .limit(1);

      // Drizzle returns the JS property names declared on the table (camelCase).
      // The HTTP contract is snake_case so the React client (which uses
      // snake_case throughout) can read these directly.
      res.json({
        tour_completed: data?.tourCompleted ?? false,
        onboarding_completed: data?.onboardingCompleted ?? false,
        help_enabled: data?.helpEnabled ?? true,
        keyboard_shortcuts_enabled: data?.keyboardShortcutsEnabled ?? true,
        persona: data?.persona ?? null,
        preferences: data?.preferences ?? {},
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Failed to fetch user preferences", { error });
      throw AppError.fromHttpStatus(500, "Failed to fetch preferences");
    }
  },
);

router.post(
  "/api/user-preferences",
  authenticateUser,
  userPreferencesRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Map snake_case HTTP body → Drizzle camelCase column names. The
      // previous version passed snake_case keys straight through, so values
      // for tour_completed / onboarding_completed / help_enabled /
      // keyboard_shortcuts_enabled were silently dropped by Drizzle (which
      // matches keys to JS property names, not column names).
      const body = req.body ?? {};
      const update: Record<string, unknown> = {};
      if (typeof body.persona === "string" || body.persona === null) {
        update.persona = body.persona;
      }
      if (typeof body.tour_completed === "boolean") update.tourCompleted = body.tour_completed;
      if (typeof body.onboarding_completed === "boolean")
        update.onboardingCompleted = body.onboarding_completed;
      if (typeof body.help_enabled === "boolean") update.helpEnabled = body.help_enabled;
      if (typeof body.keyboard_shortcuts_enabled === "boolean")
        update.keyboardShortcutsEnabled = body.keyboard_shortcuts_enabled;
      if (body.preferences && typeof body.preferences === "object") {
        update.preferences = body.preferences;
      }

      if (Object.keys(update).length === 0) {
        throw AppError.fromHttpStatus(400, "No valid preference fields supplied.");
      }

      const [data] = (await drizzle
        .insert(userPreferences)
        .values({
          ...update,
          userId: req.user.id,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: { ...update, updatedAt: new Date() },
        })
        .returning()) as any[];

      res.json({
        preferences: {
          tour_completed: data?.tourCompleted ?? false,
          onboarding_completed: data?.onboardingCompleted ?? false,
          help_enabled: data?.helpEnabled ?? true,
          keyboard_shortcuts_enabled: data?.keyboardShortcutsEnabled ?? true,
          persona: data?.persona ?? null,
          preferences: data?.preferences ?? {},
        },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Failed to update preferences", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to update preferences");
    }
  },
);

router.get(
  "/api/onboarding/progress",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const [[agentRow], [callLogRow], [settingsRow], [prefsRow], [phoneRow]] =
        await drizzle.transaction((tx) =>
          serialQueryBatch([
            tx
              .select({ count: sql<number>`count(*)` })
              .from(agents)
              .where(eq(agents.userId, userId)),
            tx
              .select({ count: sql<number>`count(*)` })
              .from(callLogs)
              .where(eq(callLogs.userId, userId)),
            tx
              .select({
                subscriptionStatus: settings.subscriptionStatus,
                vapiPhoneNumberId: settings.vapiPhoneNumberId,
              })
              .from(settings)
              .where(eq(settings.userId, userId))
              .limit(1),
            tx
              .select({ onboardingCompleted: userPreferences.onboardingCompleted })
              .from(userPreferences)
              .where(eq(userPreferences.userId, userId))
              .limit(1),
            tx
              .select({ count: sql<number>`count(*)` })
              .from(schema.phoneNumbers)
              .where(eq(schema.phoneNumbers.userId, userId)),
          ]),
        );

      const platformVoiceReady = Boolean(process.env.VAPI_PRIVATE_KEY?.trim());
      const tenantHasNumber =
        Number(phoneRow?.count || 0) > 0 || Boolean(settingsRow?.vapiPhoneNumberId);

      res.json({
        has_agents: Number(agentRow?.count || 0) > 0,
        has_calls: Number(callLogRow?.count || 0) > 0,
        has_billing: settingsRow?.subscriptionStatus === "active",
        // Managed Vapi: voice is ready when the platform key is present and the
        // tenant has a bound number (or legacy settings phone id).
        has_voice: platformVoiceReady && tenantHasNumber,
        completed: !!prefsRow?.onboardingCompleted,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Failed to fetch onboarding progress", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to fetch progress");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// GDPR / data-export: POST /api/account/export
// Exports all user-owned data from every wireline_* table as a JSON file.
// Returns a download URL or the JSON directly depending on implementation.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/api/account/export",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user.id;
    try {
      log.info("account export requested", { uid });

      const exportData: Record<string, any[]> = {};
      let totalRows = 0;

      const tablesToExport = [
        { key: "settings", table: schema.settings },
        { key: "agents", table: schema.agents },
        { key: "directives", table: schema.directives },
        { key: "knowledge", table: schema.knowledge },
        { key: "personality", table: schema.personality },
        { key: "lessons", table: schema.agentLessons },
        { key: "appointments", table: schema.appointments },
        { key: "call_logs", table: schema.callLogs },
        { key: "email_accounts", table: schema.emailAccounts },
        { key: "calendar_accounts", table: schema.calendarAccounts },
        { key: "consent_log", table: schema.consentLog },
        { key: "email_threads", table: schema.emailThreads },
        { key: "email_messages", table: schema.emailMessages },
        { key: "fleet_tasks", table: schema.followUpTasks },
        { key: "phone_numbers", table: schema.phoneNumbers },
        { key: "outbound_leads", table: schema.outboundLeads },
        { key: "outbound_campaigns", table: schema.outboundCampaigns },
        { key: "signal_presence", table: schema.signalPresence },
        { key: "audit_log", table: schema.auditLog },
        { key: "webhooks", table: schema.webhooks },
        { key: "webhook_deliveries", table: schema.webhookDeliveries },
        { key: "spend_budgets", table: schema.spendBudgets },
        { key: "dnc_list", table: schema.dncList },
        { key: "user_preferences", table: schema.userPreferences },
        { key: "onboarding_progress", table: schema.onboardingProgress },
        { key: "quota_limits", table: schema.quotaLimits },
        { key: "subscriptions", table: schema.subscriptions },
        { key: "team_members", table: schema.teamMembers, useTenant: true },
      ];

      // Columns that are secret material, not account data: hashed invite
      // tokens serve only to authenticate a pending invite and don't belong
      // in a data export.
      const exportOmitColumns: Record<string, readonly string[]> = {
        team_members: ["invitationTokenHash", "invitation_token_hash"],
      };

      for (const item of tablesToExport) {
        const col = (item as any).useTenant
          ? (item.table as any).tenantId
          : (item.table as any).userId;
        const rows = await drizzle
          .select()
          .from(item.table as any)
          .where(eq(col, uid));

        const omit = exportOmitColumns[item.key];
        exportData[item.key] = omit
          ? rows.map((row: Record<string, unknown>) => {
              const clean = { ...row };
              for (const key of omit) delete clean[key];
              return clean;
            })
          : rows;
        totalRows += rows.length;
      }

      // Add metadata
      const exportPackage = {
        metadata: {
          user_id: uid,
          email: req.user.email || "unknown",
          exported_at: new Date().toISOString(),
          total_rows: totalRows,
          wireline_version: "1.0.0",
        },
        tables: exportData,
      };

      log.info("account export completed", { uid, totalRows });

      // Return as JSON download
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="wireline-account-export-${uid.substring(0, 8)}-${Date.now()}.json"`,
      );
      res.status(200).json(exportPackage);
    } catch (err: any) {
      log.error("account export failed", { uid, error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Export failed.");
    }
  },
);

// Data Retention: POST /api/account/purge-old-data
// Enqueues an on-demand data-retention purge job for the authenticated tenant.
// Useful for GDPR "right to erasure" requests where the user wants old data
// purged immediately rather than waiting for the nightly scheduler.
//
// The actual deletion runs asynchronously in the job worker via the Postgres
// function wireline_purge_old_data(). Minimum retention is 90 days.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/api/account/purge-old-data",
  authenticateUser,
  jobsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user.id;
    try {
      const [settingsRow] = await drizzle
        .select({ retentionDays: settings.retentionDays })
        .from(settings)
        .where(eq(settings.userId, uid))
        .limit(1);

      const retentionDays = settingsRow?.retentionDays ?? 365;

      const result = await enqueue(drizzle, {
        userId: uid,
        type: "purge_old_data",
        payload: { user_id: uid, retention_days: retentionDays },
        maxAttempts: 3,
      });
      if (!result.ok) {
        log.error("Failed to enqueue purge_old_data job", { user_id: uid, error: result.error });
        throw AppError.fromHttpStatus(500, "Failed to schedule purge job");
      }
      log.info("purge_old_data job enqueued on demand", {
        user_id: uid,
        retention_days: retentionDays,
        jobId: result.jobId,
      });
      res.json({ success: true, retention_days: retentionDays, job_id: result.jobId });
    } catch (err: any) {
      log.error("POST /api/account/purge-old-data failed", {
        error: getErrorMessage(err),
        user_id: uid,
      });
      throw AppError.fromHttpStatus(500, "Failed to schedule purge job");
    }
  },
);

// GDPR / data-deletion: DELETE /api/user/account
// Enqueues a soft-delete request. The actual hard-delete cascade runs in the
// background worker (`purge_deleted_account` job type) only after a 30-day
// grace period elapses, during which the user can call
// POST /api/account/cancel-deletion to revoke the request.
//
// Requires the authenticated user to confirm intent by passing
// { confirm: "DELETE MY ACCOUNT" } in the body.
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/api/user/account",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";
    if (req.body?.confirm !== CONFIRMATION_PHRASE) {
      return res.status(400).json({
        code: "BAD_REQUEST",
        error: `Send { "confirm": "${CONFIRMATION_PHRASE}" } to confirm deletion.`,
        grace_days: ACCOUNT_DELETION_GRACE_DAYS,
        info: `Account deletion is reversible for ${ACCOUNT_DELETION_GRACE_DAYS} days via POST /api/account/cancel-deletion.`,
      });
    }
    const uid = req.user.id;
    try {
      const requestedAt = new Date();
      const scheduledPurgeAt = computeScheduledPurgeAt(requestedAt);

      const [existing] = await drizzle
        .select()
        .from(deletionQueue)
        .where(sql`${deletionQueue.userId} = ${uid} AND ${deletionQueue.status} = 'pending'`)
        .limit(1);

      let queueRow: typeof deletionQueue.$inferSelect;
      if (existing) {
        queueRow = existing;
      } else {
        const [inserted] = (await drizzle
          .insert(deletionQueue)
          .values({
            userId: uid,
            requestedAt,
            scheduledPurgeAt,
            status: "pending",
            ip: req.ip ?? null,
            userAgent: req.headers?.["user-agent"] ?? null,
          })
          .returning()) as any[];

        if (!inserted) {
          log.error("account deletion: enqueue failed", { uid });
          throw AppError.fromHttpStatus(500, "Failed to schedule account deletion.");
        }
        queueRow = inserted;
      }

      const renewal = await stopRenewalForDeletion(uid);

      // Awaited: a detached audit write can be frozen mid-flight on Vercel
      // once the response goes out, losing the request evidence.
      await auditLogger
        .logAccountDeletionRequested({
          userId: uid,
          scheduledPurgeAt: queueRow.scheduledPurgeAt?.toISOString() ?? "",
          ip: req.ip,
        })
        .catch((err) =>
          log.warn("audit logAccountDeletionRequested failed", {
            uid,
            error: getErrorMessage(err),
          }),
        );

      return res.status(202).json({
        status: "pending",
        scheduled_purge_at: queueRow.scheduledPurgeAt,
        grace_days: ACCOUNT_DELETION_GRACE_DAYS,
        cancel_endpoint: "/api/account/cancel-deletion",
        renewal_stopped: renewal.confirmed,
        billing_period_end: renewal.billingPeriodEnd,
      });
    } catch (err: any) {
      log.error("account deletion enqueue failed", { uid, error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to schedule account deletion.");
    }
  },
);

// GDPR / data-deletion: POST /api/account/cancel-deletion
// Cancels a pending deletion request, provided the grace window has not yet
// elapsed. Idempotent: if no pending row exists, returns 404.
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/api/account/cancel-deletion",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const uid = req.user.id;
    try {
      const [existing] = await drizzle
        .select()
        .from(deletionQueue)
        .where(sql`${deletionQueue.userId} = ${uid} AND ${deletionQueue.status} = 'pending'`)
        .limit(1);

      if (!existing) {
        throw AppError.fromHttpStatus(404, "No pending deletion request found.");
      }

      if (existing.scheduledPurgeAt && existing.scheduledPurgeAt.getTime() <= Date.now()) {
        return res.status(410).json({
          code: "GONE",
          error: "Grace period has expired. Deletion can no longer be cancelled.",
          scheduled_purge_at: existing.scheduledPurgeAt.toISOString(),
        });
      }

      await drizzle
        .update(deletionQueue)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(eq(deletionQueue.id, existing.id));

      const renewal = await resumeRenewalAfterDeletionCancellation(uid);

      // Awaited: a detached audit write can be frozen mid-flight on Vercel
      // once the response goes out, losing the cancellation evidence.
      await auditLogger.logAccountDeletionCancelled({ userId: uid, ip: req.ip }).catch((err) =>
        log.warn("audit logAccountDeletionCancelled failed", {
          uid,
          error: getErrorMessage(err),
        }),
      );

      return res.json({
        status: "cancelled",
        renewal_resumed: renewal.confirmed,
        billing_period_end: renewal.billingPeriodEnd,
      });
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      log.error("cancel-deletion failed", { uid, error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to cancel deletion.");
    }
  },
);

export default router;
