import type Stripe from "stripe";
import { createHash } from "node:crypto";
import { AppError } from "./api-error";
import {
  planById,
  planByStripePrice,
  planPriceId,
  STRIPE_PLANS,
  type StripePlan,
} from "./plan-catalog";
import { resolveStrictFounderPriceId } from "./stripe-founder-price";

const CAPACITY_RANK = { light: 0, regular: 1, high: 2 } as const;
const PURPOSE = "capacity_upgrade_v1";
type Client = Pick<Stripe, "subscriptions" | "subscriptionSchedules" | "prices" | "invoices">;
export type CapacityBinding = {
  userId: string;
  customerId: string;
  subscriptionId: string;
  planId: string | null;
};
export type CapacityUpgradeStatus = {
  current_plan_id: string | null;
  interval: "month" | "year";
  effective_at: string | null;
  eligible_plan_ids: string[];
  pending: { plan_id: string; effective_at: string; status?: "scheduled" | "incomplete" } | null;
  available: boolean;
};
const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
const conflict = (message: string, code = "CAPACITY_CHANGE_UNAVAILABLE") =>
  new AppError(409, code, message);

function operationIntent(sub: Stripe.Subscription) {
  const key = sub.metadata.wireline_capacity_operation;
  const target = planById(sub.metadata.wireline_capacity_requested_plan);
  const effective = Number(sub.metadata.wireline_capacity_requested_end);
  if (!key || !target || !Number.isInteger(effective) || effective <= 0) return null;
  return { key, target, effective };
}

async function recoverCreatedSchedule(
  binding: CapacityBinding,
  sub: Stripe.Subscription,
  client: Client,
  assertSyncLease?: () => Promise<void>,
) {
  try {
    return await ownedSchedule(binding, sub, client);
  } catch (error) {
    const intent = operationIntent(sub);
    if (!intent || !sub.schedule) throw error;
    // This is a mutation endpoint only. Stripe's exact create receipt proves
    // ownership of an interrupted attempt; metadata alone cannot adopt a schedule.
    await assertSyncLease?.();
    const recovered = await client.subscriptionSchedules.create(
      { from_subscription: sub.id },
      { idempotencyKey: `${intent.key}:create` },
    );
    await assertSyncLease?.();
    if (
      recovered.id !== idOf(sub.schedule) ||
      idOf(recovered.customer) !== binding.customerId ||
      idOf(recovered.subscription) !== sub.id ||
      recovered.status !== "active"
    )
      throw error;
    return recovered;
  }
}

export function isSameChannelCapacityIncrease(
  current: StripePlan | null,
  target: StripePlan | null,
): boolean {
  return (
    !!current &&
    !!target &&
    current.catalogFamily === "channels" &&
    target.catalogFamily === "channels" &&
    !!current.capacityTier &&
    !!target.capacityTier &&
    CAPACITY_RANK[target.capacityTier] > CAPACITY_RANK[current.capacityTier] &&
    current.channels.length === target.channels.length &&
    current.channels.every((channel) => target.channels.includes(channel))
  );
}

async function readSubscription(binding: CapacityBinding, client: Client) {
  const sub = await client.subscriptions.retrieve(binding.subscriptionId);
  if (idOf(sub.customer) !== binding.customerId || sub.metadata.wireline_user_id !== binding.userId)
    throw conflict("Billing ownership could not be verified.");
  const items = sub.items.data;
  const item = items[0];
  const plan = item ? planByStripePrice(item.price) : null;
  const interval = item?.price.recurring?.interval === "year" ? "year" : "month";
  const period = item as Stripe.SubscriptionItem & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const legacy = sub as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const start = period?.current_period_start ?? legacy.current_period_start;
  const end = period?.current_period_end ?? legacy.current_period_end;
  const eligible =
    sub.status === "active" &&
    !sub.cancel_at_period_end &&
    !sub.cancel_at &&
    !sub.pending_update &&
    sub.collection_method === "charge_automatically" &&
    items.length === 1 &&
    item.quantity === 1 &&
    item.price.recurring?.interval_count === 1 &&
    ["month", "year"].includes(item.price.recurring.interval) &&
    plan?.catalogFamily === "channels" &&
    plan.id === binding.planId &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    end! > Math.floor(Date.now() / 1000) + 60 &&
    !sub.discounts?.length &&
    !item.discounts?.length &&
    !sub.default_tax_rates?.length &&
    !sub.billing_thresholds;
  return { sub, item, plan, interval, start, end, eligible } as const;
}

async function ownedSchedule(binding: CapacityBinding, sub: Stripe.Subscription, client: Client) {
  const scheduleId = idOf(sub.schedule);
  if (!scheduleId) return null;
  const schedule = await client.subscriptionSchedules.retrieve(scheduleId, {
    expand: ["phases.items.price"],
  });
  if (
    idOf(schedule.customer) !== binding.customerId ||
    idOf(schedule.subscription) !== sub.id ||
    schedule.metadata?.wireline_purpose !== PURPOSE ||
    schedule.metadata.wireline_user_id !== binding.userId
  )
    throw conflict(
      "A billing change is already scheduled. Contact support to review it.",
      "CAPACITY_CHANGE_PENDING",
    );
  return schedule;
}

function pendingFromSchedule(
  schedule: Stripe.SubscriptionSchedule | null,
  currentPlan: StripePlan | null,
) {
  if (!schedule) return null;
  const target = planById(schedule.metadata?.wireline_target_plan);
  const effective = Number(schedule.metadata?.wireline_effective_at);
  if (
    target?.id === currentPlan?.id &&
    Number.isInteger(effective) &&
    effective <= Math.floor(Date.now() / 1000)
  )
    return null;
  if (
    !target ||
    !isSameChannelCapacityIncrease(currentPlan, target) ||
    !Number.isInteger(effective) ||
    effective <= 0
  )
    throw conflict(
      "The scheduled billing change needs review. Contact support.",
      "CAPACITY_CHANGE_PENDING",
    );
  const phase = schedule.phases.find((item) => item.start_date === effective);
  const phasePrice = phase?.items.length === 1 ? phase.items[0].price : null;
  if (
    !phase ||
    phase.items[0]?.quantity !== 1 ||
    !phasePrice ||
    (typeof phasePrice === "string"
      ? ![planPriceId(target, "month"), planPriceId(target, "year")].includes(phasePrice)
      : planByStripePrice(phasePrice)?.id !== target.id)
  )
    throw conflict(
      "The scheduled capacity could not be verified. Contact support.",
      "CAPACITY_CHANGE_PENDING",
    );
  return { plan_id: target.id, effective_at: new Date(effective * 1000).toISOString() };
}

export async function getCapacityUpgradeStatus(
  binding: CapacityBinding,
  client: Client,
): Promise<CapacityUpgradeStatus> {
  const state = await readSubscription(binding, client);
  const intent = operationIntent(state.sub);
  let schedule: Stripe.SubscriptionSchedule | null = null;
  try {
    schedule = await ownedSchedule(binding, state.sub, client);
  } catch (error) {
    if (!intent || !(error instanceof AppError) || error.code !== "CAPACITY_CHANGE_PENDING")
      throw error;
  }
  const confirmed = pendingFromSchedule(schedule, state.plan);
  const pending: CapacityUpgradeStatus["pending"] = confirmed
    ? { ...confirmed, status: "scheduled" }
    : intent && intent.target.id !== state.plan?.id
      ? {
          plan_id: intent.target.id,
          effective_at: new Date(intent.effective * 1000).toISOString(),
          status: "incomplete",
        }
      : null;
  const ids =
    state.eligible && !pending
      ? STRIPE_PLANS.filter(
          (plan) =>
            isSameChannelCapacityIncrease(state.plan, plan) &&
            plan.checkoutAvailability === "available" &&
            planPriceId(plan, state.interval),
        ).map((plan) => plan.id)
      : [];
  return {
    current_plan_id: binding.planId,
    interval: state.interval,
    effective_at: state.end ? new Date(state.end * 1000).toISOString() : null,
    eligible_plan_ids: ids,
    pending,
    available: ids.length > 0,
  };
}

/** Remove only our scheduled change; never cancel the paid subscription here. */
export async function releaseOwnedCapacitySchedule(
  binding: CapacityBinding,
  client: Client,
  assertSyncLease?: () => Promise<void>,
): Promise<boolean> {
  const { sub } = await readSubscription(binding, client);
  await assertSyncLease?.();
  const intent = operationIntent(sub);
  const schedule = sub.schedule
    ? await recoverCreatedSchedule(binding, sub, client, assertSyncLease)
    : null;
  await assertSyncLease?.();
  if (!schedule && !intent) return false;
  if (schedule) {
    const released = await client.subscriptionSchedules.release(
      schedule.id,
      { preserve_cancel_date: true },
      { idempotencyKey: `capacity:${schedule.id}:release` },
    );
    await assertSyncLease?.();
    if (
      released.status !== "released" ||
      idOf(released.released_subscription) !== binding.subscriptionId
    )
      throw AppError.serviceUnavailable(
        "The scheduled change could not be removed. Refresh before retrying.",
      );
  }
  const generation =
    schedule?.id ?? createHash("sha256").update(intent!.key).digest("hex").slice(0, 24);
  await client.subscriptions.update(
    sub.id,
    {
      metadata: {
        wireline_capacity_last_release: generation,
        wireline_capacity_operation: "",
        wireline_capacity_requested_plan: "",
        wireline_capacity_requested_end: "",
      },
    },
    { idempotencyKey: `capacity:${sub.id}:${generation}:clear` },
  );
  return true;
}

/** Detach the paid, already-applied phase so Stripe Portal cancellation works. */
export async function releaseAppliedCapacitySchedule(
  binding: CapacityBinding,
  client: Client,
  assertSyncLease?: () => Promise<void>,
): Promise<void> {
  const { sub, plan } = await readSubscription(binding, client);
  await assertSyncLease?.();
  if (plan?.id !== binding.planId) return;
  const intent = operationIntent(sub);
  if (!sub.schedule) {
    if (intent?.target.id === binding.planId)
      await releaseOwnedCapacitySchedule(binding, client, assertSyncLease);
    return;
  }
  const schedule = await ownedSchedule(binding, sub, client);
  await assertSyncLease?.();
  if (
    schedule?.metadata?.wireline_target_plan === binding.planId &&
    Number(schedule.metadata?.wireline_effective_at) <= Math.floor(Date.now() / 1000)
  )
    await releaseOwnedCapacitySchedule(binding, client, assertSyncLease);
}

/** Caller serializes this operation per tenant. Stripe keys survive a lost response. */
export async function scheduleCapacityUpgrade(
  binding: CapacityBinding,
  targetId: string,
  client: Client,
) {
  const state = await readSubscription(binding, client);
  const target = planById(targetId);
  if (
    !state.eligible ||
    !isSameChannelCapacityIncrease(state.plan, target) ||
    target?.checkoutAvailability !== "available"
  )
    throw conflict(
      "Choose a higher capacity for the same channels and billing interval on an active subscription.",
    );
  const targetPrice = await resolveStrictFounderPriceId(target.id, state.interval, client);
  if (!targetPrice)
    throw AppError.fromHttpStatus(503, "This capacity is not available yet.", {
      code: "CHANNEL_CHECKOUT_UNAVAILABLE",
    });
  const intent = operationIntent(state.sub);
  if (intent && (intent.target.id !== target.id || intent.effective !== state.end))
    throw conflict(
      "Remove the existing capacity change before choosing another.",
      "CAPACITY_CHANGE_PENDING",
    );
  const key =
    intent?.key ??
    `capacity:${state.sub.id}:${state.end}:${state.sub.metadata.wireline_capacity_last_release || "initial"}`;
  if (!intent) {
    if (state.sub.schedule) {
      const existing = await ownedSchedule(binding, state.sub, client);
      const pending = pendingFromSchedule(existing, state.plan);
      if (pending?.plan_id === target.id) return { status: "scheduled" as const, ...pending };
      throw conflict(
        "Remove the existing capacity change before choosing another.",
        "CAPACITY_CHANGE_PENDING",
      );
    }
    // Commit recovery identity to the owned provider subscription before the
    // create call. A timeout never leaves an unidentifiable mutable resource.
    await client.subscriptions.update(
      state.sub.id,
      {
        metadata: {
          wireline_capacity_operation: key,
          wireline_capacity_requested_plan: target.id,
          wireline_capacity_requested_end: String(state.end),
        },
      },
      { idempotencyKey: `${key}:${target.id}:intent` },
    );
    state.sub.metadata = {
      ...state.sub.metadata,
      wireline_capacity_operation: key,
      wireline_capacity_requested_plan: target.id,
      wireline_capacity_requested_end: String(state.end),
    };
  }
  let schedule: Stripe.SubscriptionSchedule;
  if (state.sub.schedule) {
    schedule = (await recoverCreatedSchedule(binding, state.sub, client))!;
    if (schedule.metadata?.wireline_target_plan) {
      const pending = pendingFromSchedule(schedule, state.plan);
      if (pending) {
        if (pending.plan_id !== target.id)
          throw conflict(
            "Another capacity increase is already scheduled.",
            "CAPACITY_CHANGE_PENDING",
          );
        return { status: "scheduled" as const, ...pending };
      }
    }
  } else {
    schedule = await client.subscriptionSchedules.create(
      { from_subscription: state.sub.id },
      { idempotencyKey: `${key}:create` },
    );
  }
  // Do not replace a cancellation or a changed billing period that raced create.
  const latest = await readSubscription(binding, client);
  if (!latest.eligible || latest.end !== state.end || idOf(latest.sub.schedule) !== schedule.id)
    throw conflict("Billing changed while scheduling. Refresh and try again.");
  const metadata = {
    wireline_purpose: PURPOSE,
    wireline_user_id: binding.userId,
    wireline_target_plan: target.id,
    wireline_effective_at: String(state.end),
  };
  const updated = await client.subscriptionSchedules.update(
    schedule.id,
    {
      end_behavior: "release",
      proration_behavior: "none",
      metadata,
      phases: [
        {
          start_date: state.start!,
          end_date: state.end!,
          items: [{ price: state.item.price.id, quantity: 1 }],
          proration_behavior: "none",
          automatic_tax: { enabled: state.sub.automatic_tax.enabled },
        },
        {
          start_date: state.end!,
          duration: { interval: state.interval, interval_count: 1 },
          items: [{ price: targetPrice, quantity: 1 }],
          proration_behavior: "none",
          automatic_tax: { enabled: state.sub.automatic_tax.enabled },
          metadata: {
            wireline_plan: target.id,
            wireline_capacity_previous_plan: state.plan!.id,
            wireline_capacity_effective_at: String(state.end),
            wireline_capacity_target_plan: target.id,
          },
        },
      ],
    },
    { idempotencyKey: `${key}:${target.id}:apply` },
  );
  const pending = pendingFromSchedule(updated, state.plan);
  if (!pending || pending.plan_id !== target.id)
    throw AppError.fromHttpStatus(
      503,
      "The capacity change could not be confirmed. Refresh before retrying.",
    );
  return { status: "scheduled" as const, ...pending };
}

/** A scheduled phase is not a payment receipt. Keep the old capacity until paid. */
export async function paidCapacityPlan(
  sub: Stripe.Subscription,
  next: StripePlan | null,
  mirroredPlanId: string | null | undefined,
  client: Pick<Stripe, "invoices">,
): Promise<StripePlan | null> {
  if (!next || next.id === mirroredPlanId || sub.metadata.wireline_capacity_target_plan !== next.id)
    return next;
  const previous = planById(sub.metadata.wireline_capacity_previous_plan);
  const effective = Number(sub.metadata.wireline_capacity_effective_at);
  if (
    !isSameChannelCapacityIncrease(previous, next) ||
    !Number.isInteger(effective) ||
    effective <= 0
  )
    throw conflict("Scheduled capacity payment terms could not be verified.");
  const invoiceId = idOf(sub.latest_invoice);
  if (!invoiceId) return previous;
  const invoice = await client.invoices.retrieve(invoiceId);
  const owner =
    invoice.parent?.subscription_details?.subscription ??
    (invoice as Stripe.Invoice & { subscription?: string }).subscription;
  const paid =
    invoice.status === "paid" &&
    invoice.amount_remaining === 0 &&
    idOf(owner) === sub.id &&
    idOf(invoice.customer) === idOf(sub.customer) &&
    !invoice.lines.has_more &&
    invoice.lines.data.some((line) => {
      const compat = line as Stripe.InvoiceLineItem & {
        price?: Stripe.Price | string;
        proration?: boolean;
      };
      const price = line.pricing?.price_details?.price ?? compat.price;
      const priceId = idOf(price);
      return (
        priceId ===
          sub.items.data.find((item) => planByStripePrice(item.price)?.id === next.id)?.price.id &&
        !line.parent?.subscription_item_details?.proration &&
        !compat.proration &&
        line.amount > 0 &&
        line.period.start >= effective
      );
    });
  return paid ? next : previous;
}
