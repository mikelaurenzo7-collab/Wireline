/* eslint-disable @typescript-eslint/no-explicit-any -- admin migration routes normalize heterogeneous legacy rows during one-off backfills. */

import { Router, Request, Response } from "express";
import { AppError } from "../../lib/api-error";
import { drizzle, log } from "../../lib/server-context";
import * as schema from "../../db/schema";
import { and, eq, or, sql } from "drizzle-orm";
import type { AuthenticatedRequest } from "../../types/auth";
import { WIRELINE_PERSONAS } from "../../lib/wireline-agent-personas";
import type { WirelinePersonaId } from "../../lib/wireline-agent-escalation";
import { purgeAccount } from "../../lib/account-deletion";
import { authorizeMigration, optionalAuth } from "./auth";
import { VAPI_TENANT_DEFAULT_MODEL, VAPI_TENANT_DEFAULT_PROVIDER } from "../../lib/ai-models";

const router = Router();

/**
 * One-shot provisioning endpoint for Wireline's own customer-facing
 * AI agents (Reception / Sales / Support — Mira, Casey, Alex).
 *
 * Purpose: dogfooding. Mike runs the AI receptionist product on his
 * OWN main number so callers experience the platform first-hand. This
 * endpoint upserts the three internal agents into wireline_agents with
 * the `wireline_internal: true` flag stamped into business_variables —
 * the assistant factory keys off that flag to layer in the persona
 * system prompt + first-message + voice from
 * src/lib/wireline-agent-personas.ts.
 *
 * Idempotent: if an agent for a persona already exists for the
 * platform owner (matching by `wireline_persona_id` in
 * business_variables), we update its fields; otherwise we insert.
 * Re-running is safe + cheap.
 *
 * Owner resolution: we look up the user with email = OWNER_EMAIL env
 * var. If no such user exists, we return 412 (precondition failed) —
 * Mike's account must exist before we provision the dogfood agents
 * (otherwise we'd create orphaned rows).
 *
 * Auth: same `optionalAuth` + `authorizeMigration` pair as every other
 * endpoint in this file (OWNER_EMAIL session OR X-Migration-Token).
 *
 * Response: returns the resolved agent IDs per persona so the caller
 * can wire them into the Vapi inbound-number routing table next.
 */
router.post(
  "/api/admin/provision-wireline-agents",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;

    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) {
      return res.status(412).json({
        code: "ERROR",
        error: "OWNER_EMAIL env var is not set. Cannot provision Wireline agents without an owner.",
      });
    }

    // Look up the owner user row — we need their UUID to stamp
    // user_id on the agents. We query the wireline_users table that
    // the auth layer populates after first sign-in.
    let ownerUserId: string | null = null;
    try {
      const [ownerRow] = await drizzle
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, ownerEmail))
        .limit(1);
      ownerUserId = ownerRow?.id || null;
    } catch (e: any) {
      log.error("provision-wireline-agents owner lookup failed", {
        error: e?.message,
        stack: e?.stack,
      });
      throw AppError.fromHttpStatus(500, "Owner lookup failed");
    }

    if (!ownerUserId) {
      return res.status(412).json({
        code: "ERROR",
        error: `No user with email ${ownerEmail} exists yet. Sign in once via the app, then re-run this endpoint.`,
      });
    }

    const provisioned: Array<{
      persona: WirelinePersonaId;
      agent_id: string;
      action: "created" | "updated";
    }> = [];

    // Wireline-internal persona overlay flags. Stored in
    // business_variables so we don't have to add a dedicated column to
    // wireline_agents — the column is already JSONB + the assistant
    // factory keys off these specific shapes.
    for (const persona of Object.values(WIRELINE_PERSONAS)) {
      try {
        // Look for an existing internal agent with this persona id by
        // scanning the owner's agents + matching business_variables.
        // Drizzle's jsonb predicates are awkward — we do a small select
        // + JS filter rather than a clever SQL predicate that risks
        // diverging from how the assistant factory reads the same field.
        const existingRows = await drizzle
          .select()
          .from(schema.agents)
          .where(eq(schema.agents.userId, ownerUserId));
        const existing = existingRows.find((row) => {
          const bv = (row.businessVariables || {}) as Record<string, unknown>;
          return bv.wireline_internal === true && bv.wireline_persona_id === persona.id;
        });

        const businessVariables = {
          wireline_internal: true,
          wireline_persona_id: persona.id,
          provisioned_at: new Date().toISOString(),
        };

        if (existing) {
          await drizzle
            .update(schema.agents)
            .set({
              name: persona.name,
              role: persona.role,
              voiceId: persona.voiceId,
              voiceProvider: "11labs",
              firstMessage: persona.firstMessage,
              businessVariables,
              // We deliberately do NOT touch Account Holder-tuned fields here
              // (voiceSpeed, voiceStability, etc.) — re-running the
              // endpoint shouldn't trample those if Mike has tuned them.
            })
            .where(eq(schema.agents.id, existing.id));
          provisioned.push({ persona: persona.id, agent_id: existing.id, action: "updated" });
        } else {
          // Deterministic ID: `wireline-${persona.id}` so the row is
          // easy to find by hand + safe to reference from other
          // migrations. Also makes the inbound-number → agent-id
          // mapping that Mike configures in Vapi predictable.
          const agentId = `wireline-${persona.id}`;
          await drizzle.insert(schema.agents).values({
            id: agentId,
            userId: ownerUserId,
            name: persona.name,
            role: persona.role,
            voiceId: persona.voiceId,
            voiceProvider: "11labs",
            firstMessage: persona.firstMessage,
            archetype: "Receptionist",
            channel: "voice",
            businessVariables,
          });
          provisioned.push({ persona: persona.id, agent_id: agentId, action: "created" });
        }
      } catch (e: any) {
        log.error("provision-wireline-agents persona upsert failed", {
          persona: persona.id,
          error: e?.message,
        });
        return res.status(500).json({
          code: "INTERNAL_ERROR",
          error: `Failed provisioning persona ${persona.id}`,
          provisioned,
        });
      }
    }

    log.info("provision-wireline-agents completed", {
      ownerEmail,
      ownerUserId,
      provisioned,
    });

    return res.json({
      ok: true,
      owner_email: ownerEmail,
      owner_user_id: ownerUserId,
      agents: provisioned,
      next_steps: [
        "Configure Vapi inbound phone number to point at each agent via the assistant-id mapping.",
        "Set OWN_PHONE env var to the inbound number so the escalation engine knows where to transfer.",
        "Test by calling the main Wireline number — caller should reach Mira (Reception) first.",
      ],
    });
  },
);

/**
 * Email transport diagnostic. POST a `{ "to": "you@example.com" }` body
 * (or omit it to send to OWNER_EMAIL) and this returns the RAW Resend
 * response — status code + body — so we can see exactly why a send
 * failed. The most common failure on a fresh Resend account is an
 * unverified sending domain: Resend only lets you send from a domain
 * you've added + verified via DNS. Until then `noreply@trywireline.com`
 * is rejected.
 */
router.post("/api/admin/test-email", optionalAuth, async (req: Request, res: Response) => {
  if (!authorizeMigration(req, res)) return;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      code: "SERVICE_UNAVAILABLE",
      ok: false,
      error: "RESEND_API_KEY not set in environment.",
    });
  }
  const to = (req.body?.to as string) || process.env.OWNER_EMAIL || "";
  if (!to) {
    return res.status(400).json({
      code: "BAD_REQUEST",
      ok: false,
      error: "No `to` address and no OWNER_EMAIL set.",
    });
  }
  const { resolveResendFromAddress, getResendTransportDiagnostics } =
    await import("../../lib/resend-config");
  const from = resolveResendFromAddress();
  const transport = getResendTransportDiagnostics();

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Wireline email transport test",
        text: "If you received this, Resend is wired up correctly. — Wireline",
      }),
    });
    const body = await r.text();
    return res.json({
      ok: r.ok,
      resend_status: r.status,
      resend_body: body.slice(0, 500),
      from_used: from,
      transport,
      to,
      diagnosis: r.ok
        ? "Transport works."
        : r.status === 403
          ? `Likely the sending domain isn't verified in Resend for "${transport.from_domain}". Verify that domain under Resend → Domains, set RESEND_FROM_EMAIL or RESEND_FROM_DOMAIN in Vercel to match, then redeploy.`
          : "See resend_body for the exact error.",
    });
  } catch (_e: any) {
    return res.status(500).json({
      code: "INTERNAL_ERROR",
      ok: false,
      error: "Email send failed",
    });
  }
});

/**
 * Founder's Dashboard stats. Owner-gated (authorizeMigration accepts
 * the owner's session or the migration token). Returns the platform-
 * wide numbers Mike wants at a glance — user counts, revenue signal,
 * call volume, and error/warning counts from the audit log.
 */
router.get("/api/admin/founder-stats", optionalAuth, async (req: Request, res: Response) => {
  if (!authorizeMigration(req, res)) return;
  try {
    const num = (v: unknown) => Number(v ?? 0);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const since24h = new Date(Date.now() - 24 * 60 * 60_000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60_000);

    const [
      totalUsers,
      newUsers7d,
      payingUsers,
      trialUsers,
      activatedUsers,
      activated7d,
      medianActivation,
      agentCount,
      callsTotal,
      callsToday,
      calls7d,
      errors24h,
      warnings24h,
    ] = await Promise.all([
      drizzle.execute(sql`SELECT count(*)::int AS c FROM wireline_users`),
      drizzle.execute(
        sql`SELECT count(*)::int AS c FROM wireline_users WHERE created_at >= ${since7d.toISOString()}`,
      ),
      drizzle.execute(
        sql`SELECT count(*)::int AS c FROM wireline_subscriptions WHERE status = 'active' AND plan IS NOT NULL`,
      ),
      // Trials live in wireline_settings (subscription_status='trialing'
      // with a future trial_ends_at) — NOT in wireline_subscriptions,
      // which only gets a row once a Stripe customer exists.
      drizzle.execute(
        sql`SELECT count(*)::int AS c FROM wireline_settings WHERE subscription_status = 'trialing' AND (trial_ends_at IS NULL OR trial_ends_at > now())`,
      ),
      drizzle.execute(
        sql`SELECT count(*)::int AS c FROM wireline_settings WHERE activated_at IS NOT NULL`,
      ),
      drizzle.execute(
        sql`SELECT count(*)::int AS c FROM wireline_settings WHERE activated_at >= ${since7d.toISOString()}`,
      ),
      drizzle.execute(
        sql`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY time_to_activation_seconds)::float AS p50
            FROM wireline_settings
            WHERE activated_at IS NOT NULL AND time_to_activation_seconds IS NOT NULL`,
      ),
      drizzle.execute(sql`SELECT count(*)::int AS c FROM wireline_agents`),
      drizzle.execute(sql`SELECT count(*)::int AS c FROM wireline_call_logs WHERE demo = false`),
      drizzle.execute(
        sql`SELECT count(*)::int AS c FROM wireline_call_logs WHERE demo = false AND created_at >= ${startOfToday.toISOString()}`,
      ),
      drizzle.execute(
        sql`SELECT count(*)::int AS c FROM wireline_call_logs WHERE demo = false AND created_at >= ${since7d.toISOString()}`,
      ),
      drizzle.execute(
        sql`SELECT count(*)::int AS c FROM wireline_audit_log WHERE severity = 'error' AND created_at >= ${since24h.toISOString()}`,
      ),
      drizzle.execute(
        sql`SELECT count(*)::int AS c FROM wireline_audit_log WHERE severity = 'warning' AND created_at >= ${since24h.toISOString()}`,
      ),
    ]);

    const row = (r: any) => num(r?.rows?.[0]?.c);
    const medianRow = (r: any) => {
      const v = r?.rows?.[0]?.p50;
      return v == null ? null : Math.round(Number(v));
    };

    const total = row(totalUsers);
    const activated = row(activatedUsers);

    return res.json({
      ok: true,
      generated_at: new Date().toISOString(),
      users: {
        total,
        paying: row(payingUsers),
        trialing: row(trialUsers),
        new_last_7d: row(newUsers7d),
      },
      activation: {
        activated_total: activated,
        activated_last_7d: row(activated7d),
        activation_rate_pct: total > 0 ? Math.round((activated / total) * 100) : 0,
        median_time_to_activation_seconds: medianRow(medianActivation),
      },
      agents: { total: row(agentCount) },
      calls: {
        total: row(callsTotal),
        today: row(callsToday),
        last_7d: row(calls7d),
      },
      health: {
        errors_24h: row(errors24h),
        warnings_24h: row(warnings24h),
      },
      economics_at_risk_count: await import("../../lib/tenant-economics").then((m) =>
        m.countAtRiskTenants().catch(() => 0),
      ),
    });
  } catch (e: any) {
    log.error("founder-stats failed", { error: e?.message });
    return res.status(500).json({
      code: "INTERNAL_ERROR",
      ok: false,
      error: "Stats query failed",
    });
  }
});

/**
 * Purge demo / junk user accounts. Owner-gated. Deletes every user
 * EXCEPT a keep-list: the platform owner (OWNER_EMAIL) and the QA
 * test account (E2E_USER_EMAIL). Each non-kept user is run through
 * the same purgeAccount() cascade used by self-serve account
 * deletion, so all their tenant data goes too.
 *
 * Dry-run by default — pass `?confirm=true` to actually delete.
 * This protects against an accidental call wiping the user table.
 */
router.post("/api/admin/purge-demo-users", optionalAuth, async (req: Request, res: Response) => {
  if (!authorizeMigration(req, res)) return;
  try {
    const keepEmails = new Set(
      [process.env.OWNER_EMAIL, process.env.E2E_USER_EMAIL]
        .filter(Boolean)
        .map((e) => (e as string).trim().toLowerCase()),
    );
    if (keepEmails.size === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "No keep-list — OWNER_EMAIL/E2E_USER_EMAIL not set. Aborting." });
    }

    const allUsers = await drizzle.execute(
      sql`SELECT id, email FROM wireline_users ORDER BY created_at ASC`,
    );
    const rows = (allUsers as any).rows as Array<{ id: string; email: string }>;
    const toPurge = rows.filter((u) => !keepEmails.has((u.email || "").trim().toLowerCase()));
    const kept = rows.filter((u) => keepEmails.has((u.email || "").trim().toLowerCase()));

    const confirm = req.query.confirm === "true";
    if (!confirm) {
      return res.json({
        ok: true,
        dry_run: true,
        message: "Dry run — pass ?confirm=true to actually delete.",
        would_keep: kept.map((u) => u.email),
        would_purge_count: toPurge.length,
        would_purge: toPurge.map((u) => u.email),
      });
    }

    const purged: string[] = [];
    const failed: Array<{ email: string; error: string }> = [];
    for (const u of toPurge) {
      const result = await purgeAccount(u.id, { db: drizzle, log });
      if (result.ok) purged.push(u.email);
      else failed.push({ email: u.email, error: result.error || "unknown" });
    }
    log.info("purge-demo-users completed", {
      purged: purged.length,
      failed: failed.length,
      kept: kept.map((u) => u.email),
    });
    return res.json({
      ok: true,
      dry_run: false,
      kept: kept.map((u) => u.email),
      purged_count: purged.length,
      purged,
      failed,
    });
  } catch (e: any) {
    log.error("purge-demo-users failed", { error: e?.message });
    return res.status(500).json({
      code: "INTERNAL_ERROR",
      ok: false,
      error: "Purge failed",
    });
  }
});

/**
 * Auth-gated DDL endpoint for the performance-goals table (migration
 * 0014). Idempotent: CREATE TABLE / CREATE INDEX IF NOT EXISTS so
 * re-running after each deploy is safe.
 */
router.post(
  "/api/admin/migrate-goals",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;

    try {
      await drizzle.execute(sql`
        CREATE TABLE IF NOT EXISTS wireline_goals (
          id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    uuid NOT NULL,
          metric     text NOT NULL,
          target     integer NOT NULL CHECK (target > 0),
          label      text,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT wireline_goals_user_id_metric_key UNIQUE (user_id, metric)
        );
      `);
      await drizzle.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_goals_user
        ON wireline_goals (user_id);
      `);
      // Match the RLS posture of every other wireline_* table. Idempotent.
      await drizzle.execute(sql`
        ALTER TABLE wireline_goals ENABLE ROW LEVEL SECURITY;
      `);

      log.info("migrate-goals completed", { userId: req.user?.id || "migration-token" });
      return res.json({ ok: true, message: "Performance goals table ensured." });
    } catch (e: any) {
      log.error("migrate-goals failed", { error: e?.message, stack: e?.stack });
      throw AppError.fromHttpStatus(500, "Migration failed");
    }
  },
);

/**
 * Per-agent escalation routing (migration 0015 — 2026 audit pass).
 * Adds two columns to wireline_agents so different agents inside a
 * tenant can route the `escalate_to_human` tool to different humans:
 *
 *   - escalation_phone : SMS destination (E.164 format)
 *   - escalation_email : Email destination for non-instant escalation
 *
 * When both are NULL the handler falls back to the tenant-level
 * twilio_manager_alert_number (existing behaviour), so this migration
 * is fully backward-compatible — no agent's behaviour changes until
 * the Account Holder sets a value.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS. Safe to re-run on every deploy.
 */
router.post(
  "/api/admin/migrate-escalation-routing",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;
    try {
      await drizzle.execute(sql`
        ALTER TABLE wireline_agents
        ADD COLUMN IF NOT EXISTS escalation_phone text;
      `);
      await drizzle.execute(sql`
        ALTER TABLE wireline_agents
        ADD COLUMN IF NOT EXISTS escalation_email text;
      `);
      await drizzle.execute(sql`
        ALTER TABLE wireline_agents
        ADD COLUMN IF NOT EXISTS escalation_handoff_enabled boolean DEFAULT false;
      `);

      log.info("migrate-escalation-routing completed", {
        userId: req.user?.id || "migration-token",
      });
      return res.json({
        ok: true,
        message:
          "Per-agent escalation routing columns ensured (escalation_phone, escalation_email, escalation_handoff_enabled).",
      });
    } catch (e: any) {
      log.error("migrate-escalation-routing failed", { error: e?.message, stack: e?.stack });
      throw AppError.fromHttpStatus(500, "Migration failed");
    }
  },
);

/**
 * Secure, admin-only dry-runnable route to backfill legacy settings.
 * Updates legacy Google/Claude voice defaults to the OpenAI-native managed default.
 *
 * Body: { dryRun?: boolean }
 */
router.post(
  "/api/admin/backfill-voice-defaults",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;

    const dryRun = req.body.dryRun !== false && req.query.dry_run !== "false";

    try {
      // Find rows that still match a retired managed voice default.
      const matchingRows = await drizzle
        .select({
          id: schema.settings.id,
          userId: schema.settings.userId,
          voiceLlmProvider: schema.settings.voiceLlmProvider,
          voiceLlmModel: schema.settings.voiceLlmModel,
        })
        .from(schema.settings)
        .where(
          or(
            and(
              eq(schema.settings.voiceLlmProvider, "google"),
              eq(schema.settings.voiceLlmModel, "gemini-3.5-flash"),
            ),
            and(
              eq(schema.settings.voiceLlmProvider, "anthropic"),
              eq(schema.settings.voiceLlmModel, "claude-sonnet-4-6"),
            ),
          ),
        );

      if (dryRun) {
        log.info("[backfill-voice-defaults] Dry-run backfill voice settings defaults", {
          matchingCount: matchingRows.length,
        });
        return res.json({
          ok: true,
          dry_run: true,
          matching_count: matchingRows.length,
          matching_rows: matchingRows.map((r) => ({
            id: r.id,
            userId: r.userId,
            voiceLlmProvider: r.voiceLlmProvider,
            voiceLlmModel: r.voiceLlmModel,
          })),
        });
      }

      // Execute update query to backfill the OpenAI-native managed defaults.
      const result = await drizzle
        .update(schema.settings)
        .set({
          voiceLlmProvider: VAPI_TENANT_DEFAULT_PROVIDER,
          voiceLlmModel: VAPI_TENANT_DEFAULT_MODEL,
          updatedAt: new Date(),
        })
        .where(
          or(
            and(
              eq(schema.settings.voiceLlmProvider, "google"),
              eq(schema.settings.voiceLlmModel, "gemini-3.5-flash"),
            ),
            and(
              eq(schema.settings.voiceLlmProvider, "anthropic"),
              eq(schema.settings.voiceLlmModel, "claude-sonnet-4-6"),
            ),
          ),
        );

      const updatedCount = (result as any)?.rowCount ?? matchingRows.length;

      log.info("[backfill-voice-defaults] Committed backfill voice settings defaults", {
        updatedCount,
      });

      return res.json({
        ok: true,
        dry_run: false,
        updated_count: updatedCount,
        matching_rows_before: matchingRows.map((r) => ({
          id: r.id,
          userId: r.userId,
          voiceLlmProvider: r.voiceLlmProvider,
          voiceLlmModel: r.voiceLlmModel,
        })),
      });
    } catch (e: any) {
      log.error("[backfill-voice-defaults] Failed backfilling voice defaults", {
        error: e?.message,
      });
      return res.status(500).json({
        code: "INTERNAL_ERROR",
        ok: false,
        error: "Migration backfill failed",
      });
    }
  },
);

export default router;
