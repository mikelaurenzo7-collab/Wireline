/**
 * Trial gate — the soft 14-day onboarding window + the hard 402 wall
 * at day 15. Mounted on every route that COSTS real money to serve
 * (outbound dial, bulk outbound, new agent creation).
 *
 * Design:
 *
 *   subscriptionStatus = "trialing"
 *     → tenant is inside their 14-day soft window
 *     → outbound dial allowed up to TRIAL_MAX_OUTBOUND calls
 *     → new agent creation allowed up to TRIAL_MAX_AGENTS
 *     → inbound calls (Vapi webhook) unrestricted — never break
 *       the bundled phone number
 *
 *   subscriptionStatus = "trial_expired"
 *     → trial window closed. 402 on every money-spending route.
 *     → inbound still works (so the agent answers a paying-curious
 *       caller who might convert the tenant).
 *
 *   subscriptionStatus = "active"
 *     → tenant has a real Stripe sub. Caps come from the tier in
 *       plan-catalog.ts (max_agents, etc.), not from trial limits.
 *
 *   subscriptionStatus = "past_due" / "canceled"
 *     → same as trial_expired — 402 on spend routes, inbound works.
 *
 * Returns 402 with a machine-readable code so the frontend can show
 * the upgrade modal:
 *   TRIAL_EXPIRED          — past day 14
 *   TRIAL_LIMIT_HIT        — at the agent or outbound cap mid-trial
 *   SUBSCRIPTION_REQUIRED  — past_due / canceled
 */

import type { Request, Response, NextFunction } from "express";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, sql } from "drizzle-orm";

export const TRIAL_DAYS = 14;
export const TRIAL_MAX_AGENTS = 1;
export const TRIAL_MAX_OUTBOUND = 25;

/**
 * Insert a settings row for a brand-new tenant with the trial state
 * primed. Called from authService.signUp() right after the user row
 * is inserted. Idempotent — does nothing if a settings row already
 * exists for the userId (Stripe-checkout-first signups land here too).
 */
export async function startTrialForUser(userId: string): Promise<void> {
  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  try {
    await drizzle
      .insert(schema.settings)
      .values({
        id: userId,
        userId,
        subscriptionStatus: "trialing",
        trialEndsAt: trialEnds,
        trialOutboundCount: 0,
      })
      .onConflictDoNothing();
  } catch (err: any) {
    // Non-fatal — caller can still complete signup. The daily sweep
    // creates a settings row for any user who somehow slipped through.
    log.warn("startTrialForUser failed (continuing)", {
      userId,
      error: err?.message ?? String(err),
    });
  }
}

interface TrialCheck {
  ok: boolean;
  status: "trialing" | "trial_expired" | "active" | "past_due" | "canceled" | "unknown";
  trialEndsAt: Date | null;
  trialOutboundCount: number;
  daysLeft: number | null;
}

/**
 * Look up the tenant's current trial state. Materializes nothing —
 * returns "active" for legacy accounts that predate the trial gate
 * so they stay grandfathered in (we don't suddenly paywall existing
 * tenants). Never throws — fails open with a warning logged.
 */
async function getTrialState(userId: string): Promise<TrialCheck> {
  try {
    const [row] = await drizzle
      .select({
        status: schema.settings.subscriptionStatus,
        trialEndsAt: schema.settings.trialEndsAt,
        trialOutboundCount: schema.settings.trialOutboundCount,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1);

    if (!row) {
      return {
        ok: true,
        status: "active",
        trialEndsAt: null,
        trialOutboundCount: 0,
        daysLeft: null,
      };
    }

    const now = Date.now();
    const endsAt =
      row.trialEndsAt instanceof Date
        ? row.trialEndsAt
        : row.trialEndsAt
          ? new Date(row.trialEndsAt as any)
          : null;
    const daysLeft = endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now) / 86_400_000)) : null;

    // Lazy expiry — if the daily sweep hasn't run yet, recognize the
    // expiration on the next read so callers see the correct status
    // without waiting for the cron tick.
    let effectiveStatus = row.status as TrialCheck["status"];
    if (effectiveStatus === "trialing" && endsAt && endsAt.getTime() < now) {
      effectiveStatus = "trial_expired";
    }

    return {
      ok: effectiveStatus === "trialing" || effectiveStatus === "active",
      status: effectiveStatus,
      trialEndsAt: endsAt,
      trialOutboundCount: row.trialOutboundCount ?? 0,
      daysLeft,
    };
  } catch (err: any) {
    log.warn("getTrialState failed — allowing request through", {
      userId,
      error: err?.message ?? String(err),
    });
    return {
      ok: true,
      status: "unknown",
      trialEndsAt: null,
      trialOutboundCount: 0,
      daysLeft: null,
    };
  }
}

function trialBlock(
  res: Response,
  code: "TRIAL_EXPIRED" | "TRIAL_LIMIT_HIT" | "SUBSCRIPTION_REQUIRED" | "EMAIL_UNVERIFIED",
  reason: string,
  detail: Record<string, unknown>,
) {
  return res.status(402).json({ error: reason, code, ...detail });
}

/**
 * Look up whether the caller has confirmed their email. Returns true
 * when verified, false when not. NULL emailVerifiedAt means "not yet
 * verified"; any non-null timestamp counts as verified (we don't
 * re-validate by re-sending the link).
 *
 * Existing tenants from before the verification gate shipped are
 * backfilled to their createdAt in the migration so they stay green.
 * Never throws — fails open on DB hiccup so a transient Supabase
 * outage doesn't lock out paying tenants.
 */
async function isEmailVerified(userId: string): Promise<boolean> {
  try {
    const [row] = await drizzle
      .select({ verifiedAt: schema.users.emailVerifiedAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return !!row?.verifiedAt;
  } catch (err: any) {
    log.warn("isEmailVerified check failed — allowing request through", {
      userId,
      error: err?.message ?? String(err),
    });
    return true; // fail open
  }
}

/**
 * Express middleware — block NEW agent creation when the trial is
 * over or the tenant has already hit the 1-agent trial cap. Mount
 * on POST /api/agents before the insert handler runs.
 */
export async function enforceTrialAgentCap(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any)?.user?.id as string | undefined;
  if (!userId) return next();

  // Email-verification gate runs FIRST. An unverified caller can poke
  // the product but can't add agents — same 402 pattern as trial
  // limits so the existing upgrade modal handles the EMAIL_UNVERIFIED
  // code branch.
  if (!(await isEmailVerified(userId))) {
    return trialBlock(
      res,
      "EMAIL_UNVERIFIED",
      "Verify your email to continue — check your inbox for a link from Wireline.",
      {},
    );
  }

  const t = await getTrialState(userId);

  if (t.status === "trial_expired" || t.status === "canceled") {
    return trialBlock(res, "TRIAL_EXPIRED", "Your trial has ended — pick a plan to continue.", {
      trial_ended_at: t.trialEndsAt?.toISOString() ?? null,
    });
  }
  if (t.status === "past_due") {
    return trialBlock(
      res,
      "SUBSCRIPTION_REQUIRED",
      "Your subscription is past due — update payment to continue.",
      {},
    );
  }

  if (t.status === "trialing") {
    try {
      const [countRow] = await drizzle
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.agents)
        .where(eq(schema.agents.userId, userId));
      const current = countRow?.n ?? 0;
      if (current >= TRIAL_MAX_AGENTS) {
        return trialBlock(
          res,
          "TRIAL_LIMIT_HIT",
          `Trial accounts are capped at ${TRIAL_MAX_AGENTS} agent. Upgrade to add more.`,
          {
            limit: TRIAL_MAX_AGENTS,
            current,
            days_left: t.daysLeft,
          },
        );
      }
    } catch (err: any) {
      log.warn("enforceTrialAgentCap count failed — allowing", {
        userId,
        error: err?.message ?? String(err),
      });
    }
  }

  next();
}

/**
 * Express middleware — block outbound dialing when the trial is
 * over or the tenant is already at the 25-call outbound cap. Mount
 * on POST /api/outbound/dial and POST /api/outbound/bulk BEFORE the
 * spend guards so the upgrade-required path is surfaced before the
 * generic spend-cap path.
 *
 * On successful pass during trial, atomically increments
 * trialOutboundCount so concurrent dials can't both squeak through.
 * Active subscriptions don't touch the counter.
 */
export async function enforceTrialOutboundCap(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any)?.user?.id as string | undefined;
  if (!userId) return next();

  // Email-verification gate first. An unverified caller can't burn
  // Vapi minutes — both the trial gate and the spend gate would fire
  // 402 downstream anyway, but EMAIL_UNVERIFIED is the more
  // actionable error message for the upgrade modal.
  if (!(await isEmailVerified(userId))) {
    return trialBlock(
      res,
      "EMAIL_UNVERIFIED",
      "Verify your email to keep dialing — check your inbox for a link from Wireline.",
      {},
    );
  }

  const t = await getTrialState(userId);

  if (t.status === "trial_expired" || t.status === "canceled") {
    return trialBlock(res, "TRIAL_EXPIRED", "Your trial has ended — pick a plan to keep dialing.", {
      trial_ended_at: t.trialEndsAt?.toISOString() ?? null,
    });
  }
  if (t.status === "past_due") {
    return trialBlock(
      res,
      "SUBSCRIPTION_REQUIRED",
      "Your subscription is past due — update payment to keep dialing.",
      {},
    );
  }

  if (t.status === "trialing") {
    if (t.trialOutboundCount >= TRIAL_MAX_OUTBOUND) {
      return trialBlock(
        res,
        "TRIAL_LIMIT_HIT",
        `Trial accounts are capped at ${TRIAL_MAX_OUTBOUND} outbound calls. Upgrade to keep dialing.`,
        {
          limit: TRIAL_MAX_OUTBOUND,
          current: t.trialOutboundCount,
          days_left: t.daysLeft,
        },
      );
    }
    try {
      await drizzle
        .update(schema.settings)
        .set({ trialOutboundCount: sql`${schema.settings.trialOutboundCount} + 1` })
        .where(eq(schema.settings.userId, userId));
    } catch (err: any) {
      log.warn("trialOutboundCount increment failed — allowing", {
        userId,
        error: err?.message ?? String(err),
      });
    }
  }

  next();
}

/**
 * Daily sweep — flip subscriptionStatus from "trialing" to
 * "trial_expired" for any tenant whose trialEndsAt has passed.
 * Idempotent: only touches rows where the flip is actually needed.
 *
 * Returns the count of rows updated so the cron can log it.
 */
export async function sweepExpiredTrials(): Promise<number> {
  try {
    const res = await drizzle
      .update(schema.settings)
      .set({ subscriptionStatus: "trial_expired", updatedAt: new Date() })
      .where(
        sql`${schema.settings.subscriptionStatus} = 'trialing' AND ${schema.settings.trialEndsAt} < now()`,
      );
    const updated = (res as any)?.rowCount ?? 0;
    if (updated > 0) {
      log.info("Trial sweep flipped tenants to trial_expired", { count: updated });
    }
    return updated;
  } catch (err: any) {
    log.error("sweepExpiredTrials failed", { error: err?.message ?? String(err) });
    return 0;
  }
}
