import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { managedPortalConfigurationParams } from "../src/lib/stripe-portal-policy";

const h = vi.hoisted(() => ({
  records: [] as Stripe.BillingPortal.Configuration[],
  api: { list: vi.fn(), create: vi.fn(), update: vi.fn(), retrieve: vi.fn() },
}));

vi.mock("stripe", () => ({
  default: class {
    billingPortal = { configurations: h.api };
  },
}));
vi.mock("../scripts/lib/stripe-operator-policy.mts", () => ({
  assertStripePortalOperatorEnvironment: () => ({
    appUrl: "https://botbound.app",
    secretKey: "sk_live_mock_only",
  }),
}));
vi.mock("../src/lib/deployment-environment", () => ({
  getDeploymentIdentity: () => ({ provider: "local" }),
}));

const originalArgv = [...process.argv];

function configuration(
  id: string,
  { isDefault = false, stale = false, managed = true } = {},
): Stripe.BillingPortal.Configuration {
  const params = managedPortalConfigurationParams("https://botbound.app", []);
  return {
    id,
    active: true,
    livemode: true,
    is_default: isDefault,
    business_profile: params.business_profile,
    default_return_url: params.default_return_url,
    features: params.features,
    metadata: managed
      ? {
          ...params.metadata,
          ...(stale ? { wireline_catalog_version: "previous_catalog" } : {}),
        }
      : { another_application: "true" },
  } as Stripe.BillingPortal.Configuration;
}

async function runReconciler(apply = true) {
  vi.resetModules();
  process.argv = [...originalArgv.filter((argument) => argument !== "--apply")];
  if (apply) process.argv.push("--apply");
  await import("../scripts/reconcile-stripe-customer-portal.mts");
}

describe("Stripe managed default portal migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.records = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    h.api.list.mockImplementation(async () => ({
      data: structuredClone(h.records.filter((record) => record.active)),
      has_more: false,
    }));
    h.api.retrieve.mockImplementation(async (id: string) =>
      structuredClone(h.records.find((record) => record.id === id)),
    );
    h.api.create.mockImplementation(
      async (params: Stripe.BillingPortal.ConfigurationCreateParams) => {
        const created = {
          ...configuration("bpc_created"),
          ...structuredClone(params),
        } as Stripe.BillingPortal.Configuration;
        h.records.push(created);
        return structuredClone(created);
      },
    );
    h.api.update.mockImplementation(
      async (id: string, params: Stripe.BillingPortal.ConfigurationUpdateParams) => {
        const record = h.records.find((candidate) => candidate.id === id)!;
        // Reproduce the production provider constraint, not just call counts.
        if (record.is_default && params.active === false) {
          throw new Error("You cannot set active: false on your default PortalConfiguration.");
        }
        Object.assign(record, structuredClone(params));
        return structuredClone(record);
      },
    );
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it("repairs the old managed default and retires the replacement left by a failed migration", async () => {
    h.records = [
      configuration("bpc_replacement"),
      configuration("bpc_default", { isDefault: true, stale: true }),
    ];

    await expect(runReconciler()).resolves.toBeUndefined();

    expect(h.api.create).not.toHaveBeenCalled();
    expect(h.api.update).toHaveBeenNthCalledWith(
      1,
      "bpc_default",
      expect.objectContaining({
        metadata: expect.objectContaining({ wireline_catalog_version: "channel_plans_2026_09_v2" }),
        features: expect.objectContaining({ subscription_update: { enabled: false } }),
      }),
    );
    expect(h.api.update).toHaveBeenNthCalledWith(2, "bpc_replacement", { active: false });
    expect(h.records.filter((record) => record.active).map((record) => record.id)).toEqual([
      "bpc_default",
    ]);

    h.api.update.mockClear();
    await expect(runReconciler()).resolves.toBeUndefined();
    expect(h.api.update).not.toHaveBeenCalled();
    expect(h.api.create).not.toHaveBeenCalled();
  });

  it("updates metadata-only drift in place even when all customer controls are already correct", async () => {
    h.records = [configuration("bpc_default", { isDefault: true, stale: true })];

    await expect(runReconciler()).resolves.toBeUndefined();

    expect(h.api.update).toHaveBeenCalledTimes(1);
    expect(h.api.create).not.toHaveBeenCalled();
    expect(h.records[0].is_default).toBe(true);
    expect(h.records[0].active).toBe(true);
    expect(h.records[0].metadata?.wireline_catalog_version).toBe("channel_plans_2026_09_v2");
  });

  it("reports a stale managed default in read-only mode without changing either configuration", async () => {
    h.records = [
      configuration("bpc_replacement"),
      configuration("bpc_default", { isDefault: true, stale: true }),
    ];

    await expect(runReconciler(false)).rejects.toThrow("catalog_version_mismatch");
    expect(h.api.update).not.toHaveBeenCalled();
    expect(h.api.create).not.toHaveBeenCalled();
  });

  it("does not take over an unmanaged default when a current managed configuration exists", async () => {
    h.records = [
      configuration("bpc_unmanaged_default", { isDefault: true, managed: false }),
      configuration("bpc_current"),
    ];
    const originalDefault = structuredClone(h.records[0]);

    await expect(runReconciler()).resolves.toBeUndefined();

    expect(h.api.update).not.toHaveBeenCalled();
    expect(h.api.create).not.toHaveBeenCalled();
    expect(h.records[0]).toEqual(originalDefault);
  });

  it("creates a separate managed configuration while leaving an unmanaged default untouched", async () => {
    h.records = [configuration("bpc_unmanaged_default", { isDefault: true, managed: false })];
    const originalDefault = structuredClone(h.records[0]);

    await expect(runReconciler()).resolves.toBeUndefined();

    expect(h.api.create).toHaveBeenCalledTimes(1);
    expect(h.api.update).not.toHaveBeenCalled();
    expect(h.records[0]).toEqual(originalDefault);
  });

  it("keeps the replacement active if the default fails post-write verification", async () => {
    h.records = [
      configuration("bpc_replacement"),
      configuration("bpc_default", { isDefault: true, stale: true }),
    ];
    h.api.retrieve.mockResolvedValue(
      configuration("bpc_default", { isDefault: true, stale: true }),
    );

    await expect(runReconciler()).rejects.toThrow("verification failed: catalog_version_mismatch");

    expect(h.api.update).toHaveBeenCalledTimes(1);
    expect(h.records[0].active).toBe(true);
  });

  it("refuses an incomplete inventory before making any mutation", async () => {
    h.api.list.mockResolvedValue({ data: [], has_more: true });

    await expect(runReconciler()).rejects.toThrow("refusing partial audit");

    expect(h.api.create).not.toHaveBeenCalled();
    expect(h.api.update).not.toHaveBeenCalled();
  });
});
