import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readStripeLaunchStatus } from "../scripts/lib/stripe-launch-readiness.mjs";
import {
  FOUNDER_CATALOG_VERSION,
  FOUNDER_PRICES,
  FOUNDER_PRODUCTS,
} from "../scripts/lib/stripe-founder-catalog.mjs";

const prices = FOUNDER_PRICES.filter((price) => price.recurring);
const livePrice = (price: (typeof prices)[number]) => ({
  id: `price_${price.productKey.replaceAll("-", "")}${price.recurring!.interval}`,
  active: true,
  livemode: true,
  currency: "usd",
  lookup_key: price.lookupKey,
  unit_amount: price.unitAmount,
  billing_scheme: "per_unit",
  type: "recurring",
  recurring: { ...price.recurring, interval_count: 1 },
  metadata: {
    ...price.metadata,
    wireline_catalog_version: FOUNDER_CATALOG_VERSION,
    wireline_price_key: price.key,
  },
  product: {
    active: true,
    livemode: true,
    name: FOUNDER_PRODUCTS.find((product) => product.key === price.productKey)!.name,
    metadata: { ...price.metadata, wireline_catalog_version: FOUNDER_CATALOG_VERSION },
  },
});

const portal = () => ({
  active: true,
  livemode: true,
  metadata: {
    wireline_managed: "true",
    wireline_catalog_version: FOUNDER_CATALOG_VERSION,
    wireline_portal_products_fp: createHash("sha256").update("").digest("hex").slice(0, 32),
  },
  default_return_url: "https://botbound.app/settings/billing",
  business_profile: {
    headline: "Manage your BotBound billing, invoices, and subscription.",
    privacy_policy_url: "https://botbound.app/privacy",
    terms_of_service_url: "https://botbound.app/terms",
  },
  features: {
    customer_update: { enabled: true, allowed_updates: ["email", "address"] },
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    subscription_update: { enabled: false },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
      cancellation_reason: {
        enabled: true,
        options: ["too_expensive", "missing_features", "switched_service", "unused", "other"],
      },
    },
  },
});

async function audit(
  options: {
    selected?: typeof prices;
    mutate?: (live: ReturnType<typeof livePrice>[]) => void;
    portals?: ReturnType<typeof portal>[];
    overrides?: Record<string, string>;
    truncated?: boolean;
  } = {},
) {
  const selected =
    options.selected ??
    prices.filter(
      (price) =>
        price.metadata.wireline_plan_id !== "personal" &&
        price.metadata.wireline_channels === "voice",
    );
  const live = selected.map(livePrice);
  options.mutate?.(live);
  const env = {
    STRIPE_SECRET_KEY: "sk_live_fixture",
    ...Object.fromEntries(selected.map((price) => [price.envTarget, livePrice(price).id])),
    ...options.overrides,
  };
  const fetched: string[] = [];
  const result = await readStripeLaunchStatus({
    env,
    canonicalOrigin: "https://botbound.app",
    jsonFetch: async (url: string) => {
      fetched.push(url);
      const path = new URL(url).pathname;
      if (path === "/v1/prices")
        return { ok: true, body: { data: live, has_more: options.truncated ?? false } };
      if (path === "/v1/billing_portal/configurations")
        return { ok: true, body: { data: options.portals ?? [portal()], has_more: false } };
      return { ok: true, body: { data: [], has_more: false } };
    },
  });
  return { result, fetched };
}

describe("executable Stripe launch report", () => {
  it("certifies six Calls intervals while explicitly reporting deferred Email families", async () => {
    const { result, fetched } = await audit();
    expect(result.public_catalog).toMatchObject({
      ready: true,
      expected_price_count: 6,
      live_price_count: 6,
      findings: [],
    });
    expect(result.public_catalog.deferred_intervals).toHaveLength(12);
    expect(result.public_catalog.deferred_plan_ids).toContain("email");
    const request = new URL(fetched.find((url) => new URL(url).pathname === "/v1/prices")!);
    expect(request.searchParams.getAll("lookup_keys[]")).toHaveLength(6);
    expect(result.customer_portal).toMatchObject({
      ready: true,
      payment_method_update: true,
      invoice_history: true,
      subscription_cancel: true,
      subscription_update: false,
    });
  });

  it.each(["month", "year"])(
    "accepts independently opted-in Email %s without requiring Calls",
    async (interval) => {
      const { result } = await audit({
        selected: prices.filter(
          (price) => price.productKey === "email" && price.recurring!.interval === interval,
        ),
      });
      expect(result.public_catalog.ready).toBe(true);
      expect(result.public_catalog.plan_ids).toEqual(["email"]);
      expect(result.public_catalog.deferred_intervals).toHaveLength(17);
    },
  );

  it("fails a zero-price rollout and does not accidentally fetch the whole Stripe catalog", async () => {
    const { result, fetched } = await audit({ selected: [] });
    expect(result.public_catalog.ready).toBe(false);
    expect(result.public_catalog.findings).toContain("no_configured_new_sale_prices");
    expect(fetched.some((url) => new URL(url).pathname === "/v1/prices")).toBe(false);
  });

  it.each([
    [
      "amount",
      (live: ReturnType<typeof livePrice>[]) => {
        live[0].unit_amount = 1;
      },
      "amount_1_expected_",
    ],
    [
      "generation",
      (live: ReturnType<typeof livePrice>[]) => {
        live[0].metadata.wireline_catalog_version = "old";
      },
      "catalog_version_mismatch",
    ],
    [
      "missing",
      (live: ReturnType<typeof livePrice>[]) => {
        live.pop();
      },
      "expected_one_active_price_found_0",
    ],
    [
      "duplicate",
      (live: ReturnType<typeof livePrice>[]) => {
        live.push(live[0]);
      },
      "expected_one_active_price_found_2",
    ],
  ] as const)("rejects %s defects in every enabled interval", async (_name, mutate, finding) => {
    const { result } = await audit({ mutate });
    expect(result.public_catalog.ready).toBe(false);
    expect(result.public_catalog.findings.some((entry: string) => entry.includes(finding))).toBe(
      true,
    );
  });

  it("rejects runtime price mismatches and incomplete provider inventories", async () => {
    expect(
      (await audit({ overrides: { STRIPE_VOICE_PRICE_ID: "price_wrong" } })).result.public_catalog
        .findings,
    ).toContain("voice_monthly_channels_2026_09_v2:runtime_env_price_id_mismatch");
    expect((await audit({ truncated: true })).result.public_catalog.findings).toContain(
      "price_audit_truncated",
    );
  });

  it.each(
    (["price", "product"] as const).flatMap((owner) =>
      [
        "wireline_channels",
        "included_agents",
        "included_numbers",
        "included_mailboxes",
        "included_voice_minutes",
        "included_ai_spend_usd",
      ].map((field) => ({ owner, field })),
    ),
  )("rejects stale $owner $field that would fail strict checkout", async ({ owner, field }) => {
    const { result } = await audit({
      mutate(live) {
        const metadata = owner === "price" ? live[0].metadata : live[0].product.metadata;
        Object.assign(metadata, { [field]: field === "wireline_channels" ? "email" : "999" });
      },
    });
    expect(result.public_catalog.ready).toBe(false);
    const suffix = field === "wireline_channels" ? "channels" : field;
    expect(result.public_catalog.findings).toContain(
      `voice_monthly_channels_2026_09_v2:${owner}_${suffix}_mismatch`,
    );
  });

  it("rejects a nonrecurring configured price even if its recurring fields are present", async () => {
    const { result } = await audit({
      mutate(live) {
        live[0].type = "one_time";
      },
    });
    expect(result.public_catalog.ready).toBe(false);
    expect(result.public_catalog.findings).toContain(
      "voice_monthly_channels_2026_09_v2:type_not_recurring",
    );
  });

  it("does not borrow feature flags from an unselected portal or certify duplicate managed portals", async () => {
    const unmanaged = portal();
    unmanaged.metadata.wireline_managed = "false";
    const absent = (await audit({ portals: [unmanaged] })).result.customer_portal;
    expect(absent).toMatchObject({
      ready: false,
      payment_method_update: false,
      invoice_history: false,
      subscription_cancel: false,
    });
    const duplicate = (await audit({ portals: [portal(), portal()] })).result.customer_portal;
    expect(duplicate).toMatchObject({ ready: false, payment_method_update: false });
    expect(duplicate.findings).toContain("multiple_managed_configurations");
  });
});
