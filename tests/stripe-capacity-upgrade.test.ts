import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planById } from "../src/lib/plan-catalog";
import {
  getCapacityUpgradeStatus,
  isSameChannelCapacityIncrease,
  paidCapacityPlan,
  releaseOwnedCapacitySchedule,
  releaseAppliedCapacitySchedule,
  scheduleCapacityUpgrade,
} from "../src/lib/stripe-capacity-upgrade";
const priceResolver = vi.hoisted(() => vi.fn(async (id: string) => `price_${id}`));
vi.mock("../src/lib/stripe-founder-price", () => ({ resolveStrictFounderPriceId: priceResolver }));
const binding = {
  userId: "user",
  customerId: "cus_owner",
  subscriptionId: "sub_owner",
  planId: "voice",
};
const now = Date.parse("2026-09-27T12:00:00Z") / 1000;
const end = now + 30 * 86400;
function fixture(interval: "month" | "year" = "month") {
  const sub = {
    id: binding.subscriptionId,
    customer: binding.customerId,
    status: "active",
    metadata: { wireline_user_id: binding.userId },
    items: {
      data: [
        {
          id: "si_base",
          quantity: 1,
          price: {
            id: "price_voice",
            metadata: { wireline_plan_id: "voice" },
            recurring: { interval, interval_count: 1 },
          },
          current_period_start: now - 1000,
          current_period_end: interval === "year" ? now + 365 * 86400 : end,
        },
      ],
    },
    collection_method: "charge_automatically",
    cancel_at_period_end: false,
    cancel_at: null,
    pending_update: null,
    discounts: [],
    default_tax_rates: [],
    billing_thresholds: null,
    automatic_tax: { enabled: false },
    schedule: null,
  } as unknown as Stripe.Subscription;
  let schedule = {
    id: "sched_owned",
    customer: binding.customerId,
    subscription: sub.id,
    status: "active",
    metadata: {},
    phases: [],
  } as unknown as Stripe.SubscriptionSchedule;
  const creates = new Map<string, Stripe.SubscriptionSchedule>();
  const client = {
    subscriptions: {
      retrieve: vi.fn(async () => sub),
      update: vi.fn(async (_id: string, params: Stripe.SubscriptionUpdateParams) => {
        for (const [key, value] of Object.entries(params.metadata ?? {}))
          sub.metadata[key] = String(value);
        return sub;
      }),
    },
    prices: {},
    invoices: { retrieve: vi.fn() },
    subscriptionSchedules: {
      retrieve: vi.fn(async () => schedule),
      create: vi.fn(
        async (
          _params: Stripe.SubscriptionScheduleCreateParams,
          options: Stripe.RequestOptions,
        ) => {
          if (creates.has(options.idempotencyKey!)) return creates.get(options.idempotencyKey!)!;
          if (sub.schedule) throw new Error("Subscription already has a schedule");
          schedule = {
            ...schedule,
            id: creates.size ? `sched_owned_${creates.size + 1}` : "sched_owned",
            metadata: {},
            phases: [],
            status: "active",
          };
          creates.set(options.idempotencyKey!, schedule);
          sub.schedule = schedule.id;
          return schedule;
        },
      ),
      update: vi.fn(async (_id: string, params: Stripe.SubscriptionScheduleUpdateParams) => {
        schedule = {
          ...schedule,
          metadata: params.metadata,
          phases: params.phases,
        } as Stripe.SubscriptionSchedule;
        return schedule;
      }),
      release: vi.fn(async () => {
        sub.schedule = null;
        return { ...schedule, status: "released", released_subscription: sub.id };
      }),
    },
  };
  return {
    sub,
    client,
    api: client as unknown as Pick<
      Stripe,
      "subscriptions" | "subscriptionSchedules" | "prices" | "invoices"
    >,
    schedule: () => schedule,
    setSchedule: (value: Stripe.SubscriptionSchedule) => {
      schedule = value;
      sub.schedule = value.id;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
  priceResolver.mockClear();
  priceResolver.mockResolvedValue("price_voice-regular");
  vi.stubEnv("STRIPE_VOICE_REGULAR_PRICE_ID", "price_voice-regular");
  vi.stubEnv("STRIPE_VOICE_HIGH_PRICE_ID", "price_voice-high");
  vi.stubEnv("STRIPE_VOICE_REGULAR_ANNUAL_PRICE_ID", "price_voice-regular");
  vi.stubEnv("STRIPE_VOICE_HIGH_ANNUAL_PRICE_ID", "price_voice-high");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("scheduled same-channel capacity", () => {
  it.each(["month", "year"] as const)(
    "schedules at the actual next %s renewal without immediate charge or quota reset",
    async (interval) => {
      const f = fixture(interval);
      const before = await getCapacityUpgradeStatus(binding, f.api);
      expect(before.eligible_plan_ids).toEqual(["voice-regular", "voice-high"]);
      const result = await scheduleCapacityUpgrade(binding, "voice-regular", f.api);
      expect(result).toMatchObject({
        status: "scheduled",
        plan_id: "voice-regular",
        effective_at: before.effective_at,
      });
      expect(f.client.subscriptionSchedules.update).toHaveBeenCalledWith(
        "sched_owned",
        expect.objectContaining({
          end_behavior: "release",
          proration_behavior: "none",
          phases: [
            expect.objectContaining({
              items: [{ price: "price_voice", quantity: 1 }],
              end_date: interval === "year" ? now + 365 * 86400 : end,
            }),
            expect.objectContaining({
              items: [{ price: "price_voice-regular", quantity: 1 }],
              duration: { interval, interval_count: 1 },
              proration_behavior: "none",
            }),
          ],
        }),
        expect.objectContaining({ idempotencyKey: expect.stringContaining("voice-regular:apply") }),
      );
      expect((await getCapacityUpgradeStatus(binding, f.api)).pending).toMatchObject({
        plan_id: "voice-regular",
        effective_at: before.effective_at,
      });
      expect(f.sub.items.data[0].price.id).toBe("price_voice");
    },
  );
  it("returns the same pending change and rejects a different target", async () => {
    const f = fixture();
    const first = await scheduleCapacityUpgrade(binding, "voice-regular", f.api);
    expect(await scheduleCapacityUpgrade(binding, "voice-regular", f.api)).toEqual(first);
    await expect(scheduleCapacityUpgrade(binding, "voice-high", f.api)).rejects.toMatchObject({
      code: "CAPACITY_CHANGE_PENDING",
    });
    expect(f.client.subscriptionSchedules.update).toHaveBeenCalledTimes(1);
  });
  it("recovers a lost create/update response with the same provider operation", async () => {
    const f = fixture();
    f.client.subscriptionSchedules.update.mockRejectedValueOnce(new Error("timeout"));
    await expect(scheduleCapacityUpgrade(binding, "voice-regular", f.api)).rejects.toThrow(
      "timeout",
    );
    expect((await getCapacityUpgradeStatus(binding, f.api)).pending).toMatchObject({
      plan_id: "voice-regular",
      status: "incomplete",
    });
    await expect(scheduleCapacityUpgrade(binding, "voice-regular", f.api)).resolves.toMatchObject({
      status: "scheduled",
    });
    expect(f.client.subscriptionSchedules.create.mock.calls[0]).toEqual(
      f.client.subscriptionSchedules.create.mock.calls[1],
    );
  });
  it("removes an incomplete exact create receipt and schedules again with a new generation", async () => {
    const f = fixture();
    f.client.subscriptionSchedules.update.mockRejectedValueOnce(new Error("timeout"));
    await expect(scheduleCapacityUpgrade(binding, "voice-regular", f.api)).rejects.toThrow(
      "timeout",
    );
    expect(await releaseOwnedCapacitySchedule(binding, f.api)).toBe(true);
    expect((await getCapacityUpgradeStatus(binding, f.api)).pending).toBeNull();
    await expect(scheduleCapacityUpgrade(binding, "voice-regular", f.api)).resolves.toMatchObject({
      status: "scheduled",
    });
    expect(f.sub.schedule).toBe("sched_owned_2");
    const calls = f.client.subscriptionSchedules.create.mock.calls;
    expect(calls.at(-1)?.[1].idempotencyKey).not.toBe(calls[0][1].idempotencyKey);
  });
  it("clears an intent interrupted before any schedule was created", async () => {
    const f = fixture();
    f.client.subscriptionSchedules.create.mockRejectedValueOnce(new Error("network"));
    await expect(scheduleCapacityUpgrade(binding, "voice-regular", f.api)).rejects.toThrow(
      "network",
    );
    expect((await getCapacityUpgradeStatus(binding, f.api)).pending?.status).toBe("incomplete");
    await releaseOwnedCapacitySchedule(binding, f.api);
    expect(f.client.subscriptionSchedules.release).not.toHaveBeenCalled();
    expect((await getCapacityUpgradeStatus(binding, f.api)).available).toBe(true);
  });
  it("detaches a paid applied phase while keeping the new price and portal cancellation available", async () => {
    const f = fixture();
    await scheduleCapacityUpgrade(binding, "voice-regular", f.api);
    vi.setSystemTime((end + 60) * 1000);
    f.sub.items.data[0].price = {
      ...f.sub.items.data[0].price,
      id: "price_voice-regular",
      metadata: { wireline_plan_id: "voice-regular" },
    };
    const applied = { ...binding, planId: "voice-regular" };
    await releaseAppliedCapacitySchedule(applied, f.api);
    expect(f.sub.schedule).toBeNull();
    expect(f.sub.items.data[0].price.id).toBe("price_voice-regular");
    expect((await getCapacityUpgradeStatus(applied, f.api)).pending).toBeNull();
    await releaseAppliedCapacitySchedule(applied, f.api);
    expect(f.client.subscriptionSchedules.release).toHaveBeenCalledTimes(1);
  });
  it("does not overwrite a foreign schedule even during ambiguous-create recovery", async () => {
    const f = fixture();
    f.setSchedule({ ...f.schedule(), id: "sched_foreign" });
    f.client.subscriptionSchedules.create.mockResolvedValue({ ...f.schedule(), id: "sched_other" });
    await expect(scheduleCapacityUpgrade(binding, "voice-regular", f.api)).rejects.toMatchObject({
      code: "CAPACITY_CHANGE_PENDING",
    });
    expect(f.client.subscriptionSchedules.update).not.toHaveBeenCalled();
  });
  it.each(["email-regular", "voice", "voice-sms-regular", "starter"])(
    "rejects %s instead of changing channel or reducing capacity",
    async (id) => {
      const f = fixture();
      await expect(scheduleCapacityUpgrade(binding, id, f.api)).rejects.toMatchObject({
        status: 409,
      });
      expect(f.client.subscriptionSchedules.create).not.toHaveBeenCalled();
    },
  );
  it.each(["past_due", "trialing", "canceled"])("does not schedule against %s", async (status) => {
    const f = fixture();
    f.sub.status = status as Stripe.Subscription.Status;
    await expect(scheduleCapacityUpgrade(binding, "voice-regular", f.api)).rejects.toMatchObject({
      status: 409,
    });
    expect(f.client.subscriptionSchedules.create).not.toHaveBeenCalled();
  });
  it("refuses missing price opt-in and wrong ownership without a provider write", async () => {
    const f = fixture();
    priceResolver.mockResolvedValueOnce(null!);
    await expect(scheduleCapacityUpgrade(binding, "voice-regular", f.api)).rejects.toMatchObject({
      status: 503,
    });
    f.sub.customer = "cus_foreign";
    await expect(scheduleCapacityUpgrade(binding, "voice-regular", f.api)).rejects.toMatchObject({
      status: 409,
    });
    expect(f.client.subscriptionSchedules.create).not.toHaveBeenCalled();
  });
  it("does not overwrite cancellation that raced schedule creation", async () => {
    const f = fixture();
    f.client.subscriptionSchedules.create.mockImplementationOnce(async () => {
      f.sub.schedule = "sched_owned";
      f.sub.cancel_at_period_end = true;
      return f.schedule();
    });
    await expect(scheduleCapacityUpgrade(binding, "voice-regular", f.api)).rejects.toMatchObject({
      status: 409,
    });
    expect(f.client.subscriptionSchedules.update).not.toHaveBeenCalled();
  });
  it("releases only its own schedule and preserves cancellation and the subscription", async () => {
    const f = fixture();
    await scheduleCapacityUpgrade(binding, "voice-regular", f.api);
    f.sub.status = "past_due";
    f.sub.cancel_at_period_end = true;
    expect(await releaseOwnedCapacitySchedule(binding, f.api)).toBe(true);
    expect(f.client.subscriptionSchedules.release).toHaveBeenCalledWith(
      "sched_owned",
      { preserve_cancel_date: true },
      expect.any(Object),
    );
    expect(f.sub.cancel_at_period_end).toBe(true);
    expect(await releaseOwnedCapacitySchedule(binding, f.api)).toBe(false);
  });
  it("never releases a foreign schedule", async () => {
    const f = fixture();
    f.setSchedule(f.schedule());
    await expect(releaseOwnedCapacitySchedule(binding, f.api)).rejects.toMatchObject({
      code: "CAPACITY_CHANGE_PENDING",
    });
    expect(f.client.subscriptionSchedules.release).not.toHaveBeenCalled();
  });
});

describe("capacity payment receipt", () => {
  function renewal() {
    const f = fixture();
    f.sub.metadata = {
      ...f.sub.metadata,
      wireline_capacity_target_plan: "voice-regular",
      wireline_capacity_previous_plan: "voice",
      wireline_capacity_effective_at: String(end),
    };
    f.sub.items.data[0].price = {
      id: "price_voice-regular",
      metadata: { wireline_plan_id: "voice-regular" },
    } as Stripe.Price;
    f.sub.latest_invoice = "in_renewal";
    const invoice = {
      id: "in_renewal",
      status: "paid",
      amount_remaining: 0,
      customer: binding.customerId,
      parent: { subscription_details: { subscription: binding.subscriptionId } },
      lines: {
        has_more: false,
        data: [
          {
            amount: 5900,
            period: { start: end },
            pricing: { price_details: { price: "price_voice-regular" } },
            parent: { subscription_item_details: { proration: false } },
          },
        ],
      },
    };
    f.client.invoices.retrieve.mockResolvedValue(invoice);
    return { ...f, invoice };
  }
  it("grants only the paid target base line without changing existing counters", async () => {
    const f = renewal();
    expect(await paidCapacityPlan(f.sub, planById("voice-regular"), "voice", f.api)).toMatchObject({
      id: "voice-regular",
      max_agents: 1,
      voice_minutes_monthly: 250,
      included_phone_numbers: 1,
    });
  });
  it.each(["open", "draft", "uncollectible", "void"])(
    "retains current capacity for %s renewal despite active subscription",
    async (status) => {
      const f = renewal();
      f.invoice.status = status;
      expect(
        await paidCapacityPlan(f.sub, planById("voice-regular"), "voice", f.api),
      ).toMatchObject({ id: "voice", max_agents: 1, voice_minutes_monthly: 50 });
    },
  );
  it.each(["wrong-owner", "old-period", "proration", "wrong-price", "truncated"])(
    "refuses %s as higher-capacity payment evidence",
    async (reason) => {
      const f = renewal();
      if (reason === "wrong-owner") f.invoice.customer = "cus_other";
      if (reason === "old-period") f.invoice.lines.data[0].period.start = end - 1;
      if (reason === "proration")
        f.invoice.lines.data[0].parent.subscription_item_details.proration = true;
      if (reason === "wrong-price")
        f.invoice.lines.data[0].pricing.price_details.price = "price_voice";
      if (reason === "truncated") f.invoice.lines.has_more = true;
      expect((await paidCapacityPlan(f.sub, planById("voice-regular"), "voice", f.api))?.id).toBe(
        "voice",
      );
    },
  );
  it("provider uncertainty remains retryable and cannot grant higher capacity", async () => {
    const f = renewal();
    f.client.invoices.retrieve.mockRejectedValue(new Error("unavailable"));
    await expect(
      paidCapacityPlan(f.sub, planById("voice-regular"), "voice", f.api),
    ).rejects.toThrow("unavailable");
  });
  it("does not permit hidden channel changes through phase metadata", async () => {
    expect(isSameChannelCapacityIncrease(planById("voice"), planById("email-high"))).toBe(false);
  });
});
