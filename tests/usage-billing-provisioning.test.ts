import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const entitlements = vi.hoisted(() => ({
  current: { subscriptionStatus: "active", planId: "usage", channels: ["voice", "email"] },
}));

vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/channel-entitlements", () => ({
  getTenantChannelEntitlements: vi.fn(async () => entitlements.current),
}));

import { getIncludedPhoneLineSlots } from "../src/lib/phone-line-entitlements";
import { usageAddonSlots } from "../src/lib/usage-billing-store";
import {
  agentCapHit,
  agentCapMessage,
  resolveAgentEntitlement,
} from "../src/lib/agent-entitlements";
import { BOT_MARK_IDENTITY_CAPACITY } from "../src/lib/bot-mark";

/** select().from().where().limit() resolving each call to the next queued rows. */
function executor(...results: unknown[][]) {
  const queue = [...results];
  const select = vi.fn(() => {
    const rows = queue.shift() ?? [];
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: async () => rows,
    };
    return chain;
  });
  return { select } as never as Parameters<typeof usageAddonSlots>[1] & {
    select: typeof select;
  };
}

function read(path: string) {
  return readFileSync(resolve(__dirname, "..", path), "utf8");
}

beforeEach(() => {
  vi.stubEnv("USAGE_BILLING_ENABLED", "");
  entitlements.current = {
    subscriptionStatus: "active",
    planId: "usage",
    channels: ["voice", "email"],
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("usage add-on slots", () => {
  it.each([
    ["lite", 1, 1],
    ["standard", 1, 1],
    ["plus", 2, 2],
  ])(
    "includes the %s identities and adds only purchased extras",
    async (tier, numbers, emailAddresses) => {
      vi.stubEnv("USAGE_BILLING_ENABLED", "true");
      expect(
        await usageAddonSlots("user-1", executor([{ tier, numbers: 0, emailAddresses: 0 }])),
      ).toEqual({ numbers, emailAddresses });
      expect(
        await usageAddonSlots("user-1", executor([{ tier, numbers: 2, emailAddresses: 1 }])),
      ).toEqual({ numbers: Number(numbers) + 2, emailAddresses: Number(emailAddresses) + 1 });
    },
  );
  it("returns no slots and reads nothing while the flag is off", async () => {
    const db = executor([{ numbers: 3, emailAddresses: 2 }]);
    expect(await usageAddonSlots("user-1", db)).toEqual({ numbers: 0, emailAddresses: 0 });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("adds Starter's included identities to purchased add-ons when the row has no tier", async () => {
    vi.stubEnv("USAGE_BILLING_ENABLED", "true");
    expect(await usageAddonSlots("user-1", executor([{ numbers: 1, emailAddresses: 0 }]))).toEqual({
      numbers: 2,
      emailAddresses: 1,
    });
    expect(await usageAddonSlots("user-1", executor([]))).toEqual({
      numbers: 0,
      emailAddresses: 0,
    });
  });
});

describe("usage phone line entitlements", () => {
  it("gives a usage account no number while the flag is off", async () => {
    const db = executor([{ subscriptionStatus: "active", extraAgents: 0 }]);
    expect(await getIncludedPhoneLineSlots("user-1", db)).toBe(0);
  });

  it("gives a calls-only usage account no number until it buys the number add-on", async () => {
    vi.stubEnv("USAGE_BILLING_ENABLED", "true");
    const none = executor([{ subscriptionStatus: "active", extraAgents: 0 }], []);
    expect(await getIncludedPhoneLineSlots("user-1", none)).toBe(0);
    const bought = executor(
      [{ subscriptionStatus: "active", extraAgents: 0 }],
      [{ numbers: 2, emailAddresses: 0 }],
    );
    expect(await getIncludedPhoneLineSlots("user-1", bought)).toBe(3);
  });

  it("gives an inactive usage subscription no number", async () => {
    vi.stubEnv("USAGE_BILLING_ENABLED", "true");
    entitlements.current = { ...entitlements.current, subscriptionStatus: "past_due" };
    const db = executor([{ subscriptionStatus: "past_due", extraAgents: 0 }], [{ numbers: 2 }]);
    expect(await getIncludedPhoneLineSlots("user-1", db)).toBe(0);
  });
});

describe("unlimited Bot admission on the usage plan", () => {
  it("admits Bots up to the workspace ceiling on an active usage subscription", () => {
    const entitlement = resolveAgentEntitlement({
      isOwner: false,
      subscriptionStatus: "active",
      planId: "usage",
      maxAgents: 1,
      extraAgents: 0,
    });
    expect(entitlement).toMatchObject({
      unlimited: true,
      purchasedExtras: 0,
      effectiveCap: null,
    });
    expect(agentCapHit(50, entitlement)).toBe(false);
    expect(agentCapHit(BOT_MARK_IDENTITY_CAPACITY, entitlement)).toBe(false);
    expect(agentCapMessage(1, entitlement.unlimited)).not.toMatch(/plan includes/i);
  });

  it("keeps Bot creation open without an active subscription", () => {
    const entitlement = resolveAgentEntitlement({
      isOwner: false,
      subscriptionStatus: "canceled",
      planId: "usage",
    });
    expect(entitlement.unlimited).toBe(true);
    expect(entitlement.effectiveCap).toBeNull();
    expect(agentCapHit(1, entitlement)).toBe(false);
  });
});

describe("usage provisioning source contracts", () => {
  it("never auto-provisions a paid identity without a chosen add-on", () => {
    const source = read("src/lib/paid-bot-identity.ts");
    expect(source).toMatch(
      /isUsagePlanId\(planId\)\s*\?\s*usageBillingEnabled\(\)[\s\S]*?: \{ numbers: 0, emailAddresses: 0 \}/,
    );
    expect(source).toContain(
      "if (usageSlots && usageSlots.numbers === 0 && usageSlots.emailAddresses === 0) {",
    );
    expect(source).toMatch(/usageSlots\s*\?\s*usageSlots\.emailAddresses/);
  });

  it("treats a usage Bot with no add-ons as set up, with no BotBound inbox", () => {
    const source = read("src/routes/agentmail-routes.ts");
    expect(source).toContain("if (!usageBillingEnabled()) return null;");
    expect(source).toMatch(
      /usageSlots && usageSlots\.numbers === 0 && usageSlots\.emailAddresses === 0\) \{\s*res\.json\(\{\s*ok: true,\s*phone_number: null,\s*email: null,/,
    );
    expect(source).toContain("const needsEmail = usageSlots ? false");
  });

  it("refuses extra Bot purchases on the usage plan", () => {
    const source = read("src/routes/extra-agent-billing-atomic-routes.ts");
    expect(source).toMatch(
      /isUsagePlanId\(plan\.id\)\) \{\s*return \{\s*status: 409,[\s\S]*?EXTRA_BOTS_NOT_NEEDED/,
    );
  });

  it("keeps usage checkout dark, monthly only, and add-ons explicit", () => {
    const source = read("src/routes/launch-billing-checkout-atomic-routes.ts");
    expect(source).toMatch(
      /if \(!usageBillingEnabled\(\) \|\| !usageCheckoutConfigured\(process.env, tier\)\) \{\s*return res\.status\(503\)\.json\(\{\s*code: "USAGE_CHECKOUT_UNAVAILABLE"/,
    );
    expect(source).toContain('code: "USAGE_PLAN_MONTHLY_ONLY"');
    expect(source).toContain("if (value === true) return 1;");
    expect(source).toContain("numbers: usageAddonQuantity(req.body?.addons?.number)");
    expect(source).toContain('code: "USAGE_ADDON_UNAVAILABLE"');
  });

  it("keeps settlement scheduled when new usage work is paused", () => {
    expect(read("src/lib/job-queue-base.ts")).toContain('| "usage_meter_report"');
    expect(read("src/lib/job-worker-base.ts")).toContain('job.type === "usage_meter_report"');
    expect(read("src/routes/job-routes.ts")).not.toMatch(/usageBillingEnabled\(\) &&/);
    expect(read("src/routes/job-routes.ts")).toContain('type: "usage_meter_report"');
  });
});
