/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
/**
 * Subscription gate for routes that spend money on live telephony.
 *
 * Create → Train stays free. New accounts begin in `pending_activation` until
 * Stripe confirms a paid plan (Starter, Starter Plus, Pro, Business) or a
 * governed Enterprise contract.
 * Provider-spending actions fail closed whenever entitlement state cannot be
 * verified; read-only and draft-building surfaces remain available.
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
  | "EMAIL_UNVERIFIED"
  | "BILLING_STATE_UNAVAILABLE";

type TrialStatus =
  | "pending_activation"
  | "trialing"
  | "trial_expired"
  | "active"
  | "past_due"
  | "canceled"
  | "unknown";

interface TrialCheck {
  status: TrialStatus;
  trialEndsAt: Date | null;
  trialOutboundCount: number;
  daysLeft: number | null;
  lookupFailed: boolean;
}

/**
 * Historical name retained because password and OAuth signup paths import it.
 * New users no longer receive a trial.
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
  } catch (error: any) {
    log.warn("startTrialForUser activation setup failed (continuing signup)", {
      userId,
      error: error?.message ?? String(error),
    });
  }
  // Seed the free-tier AI hard-cap budget at signup. Without this, a
  // pending-activation tenant has NO spendBudgets row, enforceSpendCap
  // passes everything through, and the usage snapshot still displays a
  // "hard cap" that doesn't exist. Paid checkout later raises the limit via
  // the same helper in syncSubscriptionFromStripe.
  //
  // Pass the SAME executor (`tx`) so the seed runs inside the signup
  // transaction — the spend_budgets → users FK references the user row this
  // tx just inserted, which is not yet visible on a separate pooled
  // connection. Seeding on the module `drizzle` would throw 23503 and be
  // swallowed below, leaving password signups permanently unmetered.
  try {
    const { ensureDefaultAiSpendBudget } = await import("./workspace-usage-snapshot");
    await ensureDefaultAiSpendBudget(userId, null, tx);
  } catch (error: any) {
    log.warn("startTrialForUser budget seed failed (continuing signup)", {
      userId,
      error: error?.message ?? String(error),
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
  } catch (error: unknown) {
    log.warn("saveSignupAttribution failed (non-fatal)", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Missing entitlement state fails closed. A new account whose settings write
 * failed must never inherit paid live-work access by absence.
 * Query failures are surfaced separately so the client can retry safely.
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
        status: "pending_activation",
        trialEndsAt: null,
        trialOutboundCount: 0,
        daysLeft: null,
        lookupFailed: false,
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

    let status = (row.status || "unknown") as TrialStatus;
    if (status === "trialing" && endsAt && endsAt.getTime() < now) status = "trial_expired";

    return {
      status,
      trialEndsAt: endsAt,
      trialOutboundCount: row.trialOutboundCount ?? 0,
      daysLeft,
      lookupFailed: false,
    };
  } catch (error: any) {
    log.error("subscription gate state lookup failed — blocking provider spend", {
      userId,
      error: error?.message ?? String(error),
    });
    return {
      status: "unknown",
      trialEndsAt: null,
      trialOutboundCount: 0,
      daysLeft: null,
      lookupFailed: true,
    };
  }
}

function block(
  res: Response,
  status: 402 | 503,
  code: SubscriptionGateCode,
  reason: string,
  detail: Record<string, unknown> = {},
) {
  return res.status(status).json({ error: reason, code, ...detail });
}

async function getEmailVerificationState(
  userId: string,
): Promise<{ verified: boolean; lookupFailed: boolean }> {
  try {
    const [row] = await drizzle
      .select({ verifiedAt: schema.users.emailVerifiedAt })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return { verified: Boolean(row?.verifiedAt), lookupFailed: false };
  } catch (error: any) {
    log.error("email verification lookup failed — blocking provider spend", {
      userId,
      error: error?.message ?? String(error),
    });
    return { verified: false, lookupFailed: true };
  }
}

async function verifyLiveWorkAccount(req: Request, res: Response): Promise<TrialCheck | null> {
  const userId = (req as any)?.user?.id as string | undefined;
  if (!userId || isOwnerEmail((req as any)?.user?.email)) {
    return {
      status: "active",
      trialEndsAt: null,
      trialOutboundCount: 0,
      daysLeft: null,
      lookupFailed: false,
    };
  }

  const email = await getEmailVerificationState(userId);
  if (email.lookupFailed) {
    block(
      res,
      503,
      "BILLING_STATE_UNAVAILABLE",
      "Wireline could not verify live-work access. No provider action was started; try again shortly.",
      { retryable: true },
    );
    return null;
  }
  if (!email.verified) {
    block(
      res,
      402,
      "EMAIL_UNVERIFIED",
      "Verify your email to continue — check your inbox for a link from Wireline.",
    );
    return null;
  }

  const state = await getTrialState(userId);
  if (state.lookupFailed) {
    block(
      res,
      503,
      "BILLING_STATE_UNAVAILABLE",
      "Wireline could not verify subscription access. No provider action was started; try again shortly.",
      { retryable: true },
    );
    return null;
  }

  if (state.status === "pending_activation") {
    block(
      res,
      402,
      "ACTIVATION_REQUIRED",
      "Choose Starter, Starter Plus, or Pro before wiring a production number or starting live work.",
      { recovery_path: "/settings/billing" },
    );
    return null;
  }
  if (state.status === "trial_expired" || state.status === "canceled") {
    block(res, 402, "TRIAL_EXPIRED", "Your live access has ended — choose a plan to continue.", {
      trial_ended_at: state.trialEndsAt?.toISOString() ?? null,
      recovery_path: "/settings/billing",
    });
    return null;
  }
  if (state.status === "past_due") {
    block(
      res,
      402,
      "SUBSCRIPTION_REQUIRED",
      "Your subscription is past due — update payment before starting another live action.",
      { recovery_path: "/settings/billing" },
    );
    return null;
  }
  if (state.status === "unknown") {
    block(
      res,
      503,
      "BILLING_STATE_UNAVAILABLE",
      "Wireline could not confirm live-work access. No provider action was started; try again shortly.",
      { retryable: true },
    );
    return null;
  }

  return state;
}

/** Block number wiring and other provider-spending live actions until verified. */
export async function enforceLiveWorkActivation(req: Request, res: Response, next: NextFunction) {
  const state = await verifyLiveWorkAccount(req, res);
  if (!state) return;
  next();
}

/** @deprecated Use enforceLiveWorkActivation — retained for external imports. */
export const enforceTrialAgentCap = enforceLiveWorkActivation;

/** Block outbound dialing until verified and activated. */
export async function enforceTrialOutboundCap(req: Request, res: Response, next: NextFunction) {
  const state = await verifyLiveWorkAccount(req, res);
  if (!state) return;

  const userId = (req as any)?.user?.id as string | undefined;
  if (state.status === "trialing" && userId) {
    if (state.trialOutboundCount >= TRIAL_MAX_OUTBOUND) {
      block(
        res,
        402,
        "TRIAL_LIMIT_HIT",
        `Legacy trial accounts are capped at ${TRIAL_MAX_OUTBOUND} outbound calls. Upgrade to keep dialing.`,
        {
          limit: TRIAL_MAX_OUTBOUND,
          current: state.trialOutboundCount,
          days_left: state.daysLeft,
          recovery_path: "/settings/billing",
        },
      );
      return;
    }
    try {
      await drizzle
        .update(schema.settings)
        .set({ trialOutboundCount: sql`${schema.settings.trialOutboundCount} + 1` })
        .where(eq(schema.settings.userId, userId));
    } catch (error: any) {
      log.error("trial outbound reservation failed — blocking dial", {
        userId,
        error: error?.message ?? String(error),
      });
      block(
        res,
        503,
        "BILLING_STATE_UNAVAILABLE",
        "Wireline could not reserve this live call. No provider call was started; try again shortly.",
        { retryable: true },
      );
      return;
    }
  }

  next();
}

/** Legacy maintenance sweep for pre-activation trial accounts. */
export async function sweepExpiredTrials(): Promise<number> {
  try {
    const result = await drizzle
      .update(schema.settings)
      .set({ subscriptionStatus: "trial_expired", updatedAt: new Date() })
      .where(
        sql`${schema.settings.subscriptionStatus} = 'trialing' AND ${schema.settings.trialEndsAt} < now()`,
      );
    const updated = (result as any)?.rowCount ?? 0;
    if (updated > 0) log.info("Trial sweep flipped tenants to trial_expired", { count: updated });
    return updated;
  } catch (error: any) {
    log.error("sweepExpiredTrials failed", { error: error?.message ?? String(error) });
    return 0;
  }
}
