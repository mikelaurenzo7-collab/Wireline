import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
  type LiveExternalActionPolicy,
} from "../src/lib/account-environment-policy";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function deniedPolicy(environment: "demo" | "test"): LiveExternalActionPolicy {
  return {
    allowed: false,
    environment,
    status: 403,
    code: NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
    message: "Live external actions are disabled in this demo or test workspace.",
  };
}

describe("native phone account-environment boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it.each(["demo", "test"] as const)(
    "blocks %s inventory search before any Twilio access",
    async (environment) => {
      const getTwilioClient = vi.fn();
      vi.doMock("../src/lib/account-environment-policy", () => ({
        liveExternalActionPolicyForUser: vi.fn(async () => deniedPolicy(environment)),
      }));
      vi.doMock("../src/lib/server-context", () => ({
        drizzle: { execute: vi.fn() },
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));
      vi.doMock("../src/lib/twilio-service", () => ({ getTwilioClient }));
      const { listNativeAvailableLocalNumbers } =
        await import("../src/lib/voice/native-phone-carrier");

      await expect(listNativeAvailableLocalNumbers(USER_ID, "415", 8)).rejects.toMatchObject({
        status: 403,
        code: NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
      });
      expect(getTwilioClient).not.toHaveBeenCalled();
    },
  );

  it.each(["demo", "test"] as const)(
    "blocks %s provisioning before a provider lease or carrier mutation",
    async (environment) => {
      const runTenantProviderWorkWithDeletionFence = vi.fn();
      const getTwilioClient = vi.fn();
      const purchaseNativeNumber = vi.fn();
      vi.doMock("../src/lib/account-environment-policy", () => ({
        liveExternalActionPolicyForUser: vi.fn(async () => deniedPolicy(environment)),
      }));
      vi.doMock("../src/lib/server-context", () => ({
        drizzle: {},
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));
      vi.doMock("../src/lib/tenant-provider-deletion-fence", () => ({
        runTenantProviderWorkWithDeletionFence,
      }));
      vi.doMock("../src/lib/twilio-service", () => ({ getTwilioClient }));
      vi.doMock("../src/lib/orphan-carrier-ledger", () => ({
        clearNativeTwilioPurchaseClaim: vi.fn(),
        NATIVE_TWILIO_PURCHASE_OPERATION_LEASE_MS: 20 * 60_000,
      }));
      vi.doMock("../src/lib/voice/native-phone-carrier", () => ({
        NATIVE_PROVISIONING_UNAVAILABLE: "unavailable",
        purchaseNativeNumber,
        releasePurchasedNativeNumber: vi.fn(),
      }));
      const { provisionNativeTenantNumber } =
        await import("../src/lib/voice/native-phone-provisioning");

      await expect(provisionNativeTenantNumber({ userId: USER_ID })).resolves.toMatchObject({
        ok: false,
        code: NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
      });
      expect(runTenantProviderWorkWithDeletionFence).not.toHaveBeenCalled();
      expect(getTwilioClient).not.toHaveBeenCalled();
      expect(purchaseNativeNumber).not.toHaveBeenCalled();
    },
  );

  it.each(["demo", "test"] as const)(
    "blocks %s assignment before a provider lease or Twilio mutation",
    async (environment) => {
      const runTenantProviderWorkWithDeletionFence = vi.fn();
      const blocked = Object.assign(new Error(deniedPolicy(environment).message), {
        status: 403,
        code: NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
      });
      vi.doMock("../src/lib/account-environment-policy", () => ({
        assertLiveExternalActionAllowed: vi.fn(async () => {
          throw blocked;
        }),
      }));
      vi.doMock("../src/lib/server-context", () => ({
        drizzle: {},
        log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      }));
      vi.doMock("../src/lib/tenant-provider-deletion-fence", () => ({
        runTenantProviderWorkWithDeletionFence,
      }));
      const { assignNativePhoneLine } = await import("../src/lib/voice/native-phone-assignment");

      await expect(assignNativePhoneLine({ userId: USER_ID, lineId: 1n })).rejects.toMatchObject({
        status: 403,
        code: NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
      });
      expect(runTenantProviderWorkWithDeletionFence).not.toHaveBeenCalled();
    },
  );
});
