/**
 * Usage billing ledger algorithms: idempotent recording, spend-cap admission,
 * 50/80/100% alerts and the clamped, idempotent Stripe meter report.
 *
 * Storage and the Stripe client are injected (`UsageStore`, `UsageMeterClient`)
 * so the rules are proven by unit tests without a database or network. The
 * production store is `usage-billing-store.ts`.
 *
 * Money rules:
 *  - one unit of work records once: the idempotency key is unique per
 *    (meter, source type, source id) and is the Stripe meter `identifier`;
 *  - new metered work is refused once the period's spend reaches the cap;
 *  - work that was already admitted when the cap was crossed is clamped out of
 *    the Stripe report, keeping pre-tax BotBound charges within the cap.
 */
import { AppError } from "./api-error";
import {
  USAGE_METERS,
  USAGE_MAX_MONTHLY_CAP_USD,
  crossedAlertThresholds,
  fixedMonthlyUsd,
  marginalUnitUsd,
  minimumMonthlyCapUsd,
  priceMeter,
  priceMeterExact,
  type UsageMeterKey,
} from "./usage-billing-catalog";

/** Stripe accepts meter event timestamps up to 35 days old; keep a margin. */
export const USAGE_REPORT_MAX_AGE_MS = 34 * 24 * 60 * 60 * 1000;
export const USAGE_REPORT_BATCH = 100;

export type MeterTotals = Record<UsageMeterKey, number>;

export interface UsageEventInput {
  userId: string;
  periodKey: string;
  meter: UsageMeterKey;
  sourceType: string;
  sourceId: string;
  quantity: number;
  occurredAt: Date;
}

export interface UsageEventRow extends UsageEventInput {
  id: string;
  idempotencyKey: string;
  status: "pending" | "reported" | "skipped";
  attempts: number;
}

export interface UsageSpendControl {
  capUsd: number;
  numbers: number;
  emailAddresses: number;
  alertPeriodKey: string | null;
  alertLevelPct: number;
}

export interface UsageBillingIdentity {
  stripeCustomerId: string | null;
  periodKey: string;
  usagePlanActive: boolean;
}

export interface UsageStore {
  /** Insert once; returns false when the idempotency key already exists. */
  insertEvent(event: UsageEventInput & { idempotencyKey: string }): Promise<boolean>;
  pendingEvents(userId: string, limit: number): Promise<UsageEventRow[]>;
  /** Sum of `billable_quantity` already reported per meter for the period. */
  reportedTotals(userId: string, periodKey: string): Promise<MeterTotals>;
  /** Sum of recorded `quantity` (pending and reported) per meter for the period. */
  recordedTotals(userId: string, periodKey: string): Promise<MeterTotals>;
  spendControl(userId: string): Promise<UsageSpendControl>;
  billingIdentity(userId: string): Promise<UsageBillingIdentity>;
  markReported(id: string, billableQuantity: number): Promise<void>;
  markSkipped(id: string, reason: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  setAlertLevel(
    userId: string,
    periodKey: string,
    levelPct: number,
    paused: boolean,
  ): Promise<void>;
}

export interface UsageMeterClient {
  send(event: {
    meter: UsageMeterKey;
    stripeCustomerId: string;
    value: number;
    identifier: string;
    timestamp: Date;
  }): Promise<void>;
}

export function emptyMeterTotals(): MeterTotals {
  return { call_minutes: 0, emails_handled: 0, computer_minutes: 0 };
}

export function usageIdempotencyKey(
  meter: UsageMeterKey,
  sourceType: string,
  sourceId: string,
): string {
  const type = sourceType.trim();
  const id = sourceId.trim();
  if (!type || !id || id === "unknown") {
    throw new Error("Usage events need a stable source type and id.");
  }
  return `usage:${meter}:${type}:${id}`;
}

function round4(value: number): number {
  return Math.floor(value * 10_000) / 10_000;
}

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Period spend: fixed charges plus every meter priced at its period total. */
export function periodSpendUsd(control: UsageSpendControl, totals: MeterTotals): number {
  return cents(
    fixedMonthlyUsd({ numbers: control.numbers, emailAddresses: control.emailAddresses }) +
      (Object.keys(USAGE_METERS) as UsageMeterKey[]).reduce(
        (sum, meter) => sum + priceMeter(meter, totals[meter]),
        0,
      ),
  );
}

/**
 * The largest part of `quantity` whose incremental price fits in `headroomUsd`,
 * given `alreadyBilled` units of the same meter in the period.
 */
export function clampBillableQuantity(
  meter: UsageMeterKey,
  alreadyBilled: number,
  quantity: number,
  headroomUsd: number,
): number {
  if (!(quantity > 0)) return 0;
  const incremental = (q: number) =>
    priceMeterExact(meter, alreadyBilled + q) - priceMeterExact(meter, alreadyBilled);
  if (incremental(quantity) <= headroomUsd + 1e-9) return round4(quantity);
  if (headroomUsd <= 0) {
    // Units still inside the included bucket cost nothing and never breach a cap.
    const freeUnits = Math.max(0, USAGE_METERS[meter].included - alreadyBilled);
    return round4(Math.min(quantity, freeUnits));
  }
  let low = 0;
  let high = quantity;
  for (let step = 0; step < 48; step += 1) {
    const mid = (low + high) / 2;
    if (incremental(mid) <= headroomUsd + 1e-9) low = mid;
    else high = mid;
  }
  return round4(low);
}

/** Record one unit of work. Replays with the same source are no-ops. */
export async function recordUsageEvent(
  store: UsageStore,
  event: UsageEventInput,
): Promise<{ recorded: boolean; idempotencyKey: string }> {
  if (!Number.isFinite(event.quantity) || event.quantity < 0) {
    throw new Error("Usage quantity must be a non-negative number.");
  }
  const idempotencyKey = usageIdempotencyKey(event.meter, event.sourceType, event.sourceId);
  const recorded = await store.insertEvent({
    ...event,
    quantity: round4(event.quantity),
    idempotencyKey,
  });
  return { recorded, idempotencyKey };
}

export interface UsageSpendState {
  periodKey: string;
  spentUsd: number;
  capUsd: number;
  pct: number;
  atCap: boolean;
  headroomUsd: number;
}

export async function usageSpendState(store: UsageStore, userId: string): Promise<UsageSpendState> {
  const [identity, control] = await Promise.all([
    store.billingIdentity(userId),
    store.spendControl(userId),
  ]);
  const [totals, reported] = await Promise.all([
    store.recordedTotals(userId, identity.periodKey),
    store.reportedTotals(userId, identity.periodKey),
  ]);
  // Pending work is capped. Fixed charges and usage already accepted by Stripe
  // cannot be hidden by an older/invalid limit in the local projection.
  const spentUsd = Math.max(
    periodSpendUsd(control, reported),
    Math.min(periodSpendUsd(control, totals), control.capUsd),
  );
  const pct = control.capUsd > 0 ? Math.floor((spentUsd / control.capUsd) * 100) : 100;
  return {
    periodKey: identity.periodKey,
    spentUsd,
    capUsd: control.capUsd,
    pct,
    atCap: spentUsd >= control.capUsd,
    headroomUsd: cents(Math.max(0, control.capUsd - spentUsd)),
  };
}

export class UsageSpendCapReachedError extends AppError {
  constructor() {
    super(
      402,
      "USAGE_SPEND_CAP_REACHED",
      "Your monthly spending limit is reached. Raise it in Billing to resume.",
    );
  }
}

/** Validate a change against this period's accrued charges, including pending work. */
export function validateUsageMonthlyCap(
  control: UsageSpendControl,
  spentUsd: number,
  capUsd: number,
): void {
  const minUsd = Math.max(minimumMonthlyCapUsd(control), spentUsd);
  if (!Number.isFinite(capUsd) || capUsd < minUsd || capUsd > USAGE_MAX_MONTHLY_CAP_USD) {
    throw new AppError(
      400,
      "USAGE_CAP_OUT_OF_RANGE",
      `Choose a monthly limit between $${minUsd.toFixed(2)} and $${USAGE_MAX_MONTHLY_CAP_USD.toLocaleString("en-US")}. Your limit cannot be lower than charges already accrued this period.`,
    );
  }
}

/**
 * Admission for new metered work. Returns the most units the remaining
 * headroom can pay for (at the current marginal rate), or throws at the cap.
 */
export async function admitUsage(
  store: UsageStore,
  userId: string,
  meter: UsageMeterKey,
): Promise<{ maxUnits: number | null; state: UsageSpendState }> {
  const state = await usageSpendState(store, userId);
  if (state.atCap) throw new UsageSpendCapReachedError();
  const totals = await store.recordedTotals(userId, state.periodKey);
  const includedLeft = Math.max(0, USAGE_METERS[meter].included - totals[meter]);
  // Price the first paid unit, not the current one: inside the included bucket
  // the current unit costs nothing, which must not read as unbounded headroom.
  const rate = marginalUnitUsd(meter, Math.max(totals[meter], USAGE_METERS[meter].included));
  const maxUnits = rate > 0 ? includedLeft + state.headroomUsd / rate : null;
  return { maxUnits, state };
}

/**
 * Send each newly crossed 50/80/100% alert once per period. At 100% the
 * account is marked paused; admission already refuses new work at the cap.
 */
export async function evaluateUsageSpendAlerts(
  store: UsageStore,
  userId: string,
  notify: (alert: { thresholdPct: number; spentUsd: number; capUsd: number }) => Promise<void>,
): Promise<number[]> {
  const [state, control] = await Promise.all([
    usageSpendState(store, userId),
    store.spendControl(userId),
  ]);
  const previous = control.alertPeriodKey === state.periodKey ? control.alertLevelPct : 0;
  const crossed = crossedAlertThresholds(previous, state.pct);
  if (crossed.length === 0) return [];
  const highest = crossed[crossed.length - 1];
  // One message for the highest threshold: an owner never gets 50 and 80 at once.
  await notify({ thresholdPct: highest, spentUsd: state.spentUsd, capUsd: state.capUsd });
  // Advance only after transport acceptance. A retry uses the same delivery key.
  await store.setAlertLevel(userId, state.periodKey, highest, highest >= 100);
  return crossed;
}

/**
 * Report pending events for one account, oldest first. Callers serialize per
 * account (advisory lock or single worker). Reported rows are never resent; a
 * crash between the Stripe call and `markReported` resends the same
 * `identifier`, which Stripe dedupes.
 */
export async function reportPendingUsageForUser(
  store: UsageStore,
  client: UsageMeterClient,
  userId: string,
  now: Date = new Date(),
): Promise<{ reported: number; skipped: number; failed: number }> {
  const result = { reported: 0, skipped: 0, failed: 0 };
  const identity = await store.billingIdentity(userId);
  const pending = await store.pendingEvents(userId, USAGE_REPORT_BATCH);
  if (pending.length === 0) return result;
  if (!identity.stripeCustomerId || !identity.usagePlanActive) {
    for (const event of pending) {
      await store.markSkipped(event.id, "no_active_usage_subscription");
      result.skipped += 1;
    }
    return result;
  }
  const control = await store.spendControl(userId);
  const totalsByPeriod = new Map<string, MeterTotals>();
  for (const event of pending) {
    if (now.getTime() - event.occurredAt.getTime() > USAGE_REPORT_MAX_AGE_MS) {
      await store.markSkipped(event.id, "older_than_meter_window");
      result.skipped += 1;
      continue;
    }
    let totals = totalsByPeriod.get(event.periodKey);
    if (!totals) {
      totals = await store.reportedTotals(userId, event.periodKey);
      totalsByPeriod.set(event.periodKey, totals);
    }
    const headroom = control.capUsd - periodSpendUsd(control, totals);
    const billable = clampBillableQuantity(
      event.meter,
      totals[event.meter],
      event.quantity,
      headroom,
    );
    if (billable <= 0) {
      await store.markSkipped(event.id, "spend_cap");
      result.skipped += 1;
      continue;
    }
    try {
      await client.send({
        meter: event.meter,
        stripeCustomerId: identity.stripeCustomerId,
        value: billable,
        identifier: event.idempotencyKey,
        timestamp: event.occurredAt,
      });
    } catch (error) {
      await store.markFailed(event.id, error instanceof Error ? error.message : String(error));
      result.failed += 1;
      // Stop this account's batch so later events never jump ahead of the cap math.
      break;
    }
    await store.markReported(event.id, billable);
    totals[event.meter] += billable;
    result.reported += 1;
  }
  return result;
}
