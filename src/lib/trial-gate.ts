/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Subscription gate for routes that spend money on live telephony.
 *
 * Create → Train stays free: `POST /api/agents` is not gated here. New accounts
 * start in `pending_activation` until Conversation Balance top-up or a paid plan
 * clears the row. While pending, wiring numbers and placing calls return 402.
 *
 * Legacy `trialing` tenants remain supported until their existing window ends.
 */

import type { Request, Response, NextFunction } from "express";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { isOwnerEmail } from "./auth-service";

/** Legacy trial constants. New signups do not enter this path. */
export const TRIAL_DAYS = 14;
export const TRIAL_MAX_AGENTS = 1;
export const TRIAL_MAX_OUTBOUND = 25;

export type SignupAttribution = {
  preferredPlanId?: string | null;
  signupWedge?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

type SubscriptionGateCode =
  | "ACTIVATION_REQUIRED"
  | "TRIAL_EXPIRED"
  | "TRIAL_LIMIT_HIT"
  | "SUBSCRIPTION_REQUIRED"
  | "EMAIL_UNVERIFIED";

/**
 * Historical name retained because password and OAuth signup paths already
 * import it. New users no longer receive a trial: their settings row is
 * explicitly marked pending_activation until Stripe confirms a paid plan.
 */
export async function startTrialForUser(
  userId: string,
  attribution: SignupAttribution = {},
  tx: any = drizzle,
): Promise<void> {
  try {
    await tx
      .insert(schema.settings)
      .values({
        id: userId,
        userId,
        subscriptionStatus: "pending_activation",
        trialEndsAt: null,
        trialOutboundCount: 0,
        signupPlanInterest: attribution.preferredPlanId || null,
        signupWedge: attribution.signupWedge || null,
        acquisitionSource: attribution.utmSource || null,
        acquisitionMedium: attribution.utmMedium || null,
        acquisitionCampaign: attribution.utmCampaign || null,
      })
      .onConflictDoNothing();
  } catch (err: any) {
    log.warn("startTrialForUser activation setup failed (continuing)", {
      userId,
      error: err?.message ?? String(err),
    });
  }
}

export async function saveSignupAttribution(
  userId: string,
  attribution: SignupAttribution,
): Promise<void> {
  if (
    !attribution.preferredPlanId &&
    !attribution.signupWedge &&
    !attribution.utmSource &&
    !attribution.utmMedium &&
    !attribution.utmCampaign
  ) {
    return;
  }

  const attributionValues = {
    signupPlanInterest: attribution.preferredPlanId || null,
    signupWedge: attribution.signupWedge || null,
    acquisitionSource: attribution.utmSource || null,
    acquisitionMedium: attribution.utmMedium || null,
    acquisitionCampaign: attribution.utmCampaign || null,
    updatedAt: new Date(),
  };

  try {
    const updated = await drizzle
      .update(schema.settings)
      .set(attributionValues)
      .where(eq(schema.settings.userId, userId))
      .returning({ userId: schema.settings.userId });

    if (updated.length > 0) return;

    await drizzle
      .insert(schema.settings)
      .values({
        id: userId,
        userId,
        subscriptionStatus: "pending_activation",
        trialEndsAt: null,
        trialOutboundCount: 0,
        ...attributionValues,
      })
      .onConflictDoUpdate({
        target: schema.settings.userId,
        set: attributionValues,
      });
  } catch (err: unknown) {
    log.warn("saveSignupAttribution failed (non-fatal)", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

interface TrialCheck {
  ok: boolean;
  status:
    | "pending_activation"
    | "trialing"
    | "trial_expired"
    | "active"
    | "past_due"
    | "canceled"
    | "unknown";
  trialEndsAt: Date | null;
  trialOutboundCount: number;
  daysLeft: number | null;
}

/**
 * Legacy accounts without a settings row remain active so an activation-policy
 * launch cannot accidentally lock out existing customers. New accounts always
 * get the pending_activation row during signup.
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
    log.warn("subscription gate state lookup failed — allowing request through", {
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
  code: SubscriptionGateCode,
  reason: string,
  detail: Record<string, unknown>,
) {
  return res.status(402).json({ error: reason, code, ...detail });
}

/**
 * Look up whether the caller has confirmed their email. Existing users are
 * backfilled by migration; transient DB failures fail open so they do not
 * block a paying customer.
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
    return true;
  }
}

/**
 * Block live-work spend (number wiring, outbound dial) until the account is
 * verified and activated. Agent draft creation uses plan entitlements instead.
 */
export async function enforceLiveWorkActivation(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any)?.user?.id as string | undefined;
  if (!userId) return next();
  if (isOwnerEmail((req as any)?.user?.email)) return next();

  if (!(await isEmailVerified(userId))) {
    return trialBlock(
      res,
      "EMAIL_UNVERIFIED",
      "Verify your email to continue — check your inbox for a link from Wireline.",
      {},
    );
  }

  const t = await getTrialState(userId);

  if (t.status === "pending_activation") {
    return trialBlock(
      res,
      "ACTIVATION_REQUIRED",
      "Fund live work or choose shared capacity before wiring a number or placing calls.",
      {},
    );
  }
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

  next();
}

/** @deprecated Use enforceLiveWorkActivation — retained for external imports. */
export const enforceTrialAgentCap = enforceLiveWorkActivation;

/**
 * Block paid outbound dialing until the account is verified and activated.
 * Legacy trial counters are only incremented for existing trial tenants.
 */
export async function enforceTrialOutboundCap(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any)?.user?.id as string | undefined;
  if (!userId) return next();
  if (isOwnerEmail((req as any)?.user?.email)) return next();

  if (!(await isEmailVerified(userId))) {
    return trialBlock(
      res,
      "EMAIL_UNVERIFIED",
      "Verify your email to keep dialing — check your inbox for a link from Wireline.",
      {},
    );
  }

  const t = await getTrialState(userId);

  if (t.status === "pending_activation") {
    return trialBlock(
      res,
      "ACTIVATION_REQUIRED",
      "Fund live work or choose shared capacity before placing a call.",
      {},
    );
  }
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
 * Legacy maintenance sweep for accounts that were already trialing before
 * paid activation became the default. New accounts never enter this flow.
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
