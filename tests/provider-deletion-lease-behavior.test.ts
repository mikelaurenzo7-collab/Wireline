import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const leaseMocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
}));
const environmentMocks = vi.hoisted(() => ({
  assertAllowed: vi.fn(),
}));

vi.mock("../src/lib/account-operation-lease", () => ({
  PROVIDER_OPERATION_LEASE_MS: 15 * 60_000,
  acquireAccountOperationLease: leaseMocks.acquire,
  releaseAccountOperationLease: leaseMocks.release,
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: environmentMocks.assertAllowed,
  assertExternalEntityActionAllowed: vi.fn(async () => undefined),
}));

import { runTenantProviderWorkWithDeletionFence } from "../src/lib/tenant-provider-deletion-fence";
import { placeOutboundCall } from "../src/lib/voice/outbound-call-service";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("durable provider deletion leases", () => {
  beforeEach(() => {
    leaseMocks.acquire.mockReset();
    leaseMocks.release.mockReset();
    environmentMocks.assertAllowed.mockReset();
    environmentMocks.assertAllowed.mockResolvedValue(undefined);
    leaseMocks.acquire.mockResolvedValue({
      id: "lease-1",
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    leaseMocks.release.mockResolvedValue(undefined);
  });

  it("releases an unambiguously successful provider operation", async () => {
    await expect(
      runTenantProviderWorkWithDeletionFence({
        userId: "user-1",
        operation: "definite_success",
        perform: async () => "persisted",
      }),
    ).resolves.toEqual({ performed: true, result: "persisted" });

    expect(leaseMocks.acquire).toHaveBeenCalledTimes(1);
    expect(leaseMocks.release).toHaveBeenCalledWith({ id: "lease-1", userId: "user-1" });
  });

  it("releases a definite local/provider rejection immediately", async () => {
    const retainOnSuccess = vi.fn((result: { accepted: boolean }) => result.accepted);
    await expect(
      runTenantProviderWorkWithDeletionFence({
        userId: "user-1",
        operation: "definite_rejection",
        retainOnSuccess,
        perform: async () => ({ accepted: false }),
      }),
    ).resolves.toEqual({ performed: true, result: { accepted: false } });

    expect(retainOnSuccess).toHaveBeenCalledWith({ accepted: false });
    expect(leaseMocks.acquire).toHaveBeenCalledTimes(1);
    expect(leaseMocks.release).toHaveBeenCalledWith({ id: "lease-1", userId: "user-1" });
  });

  it("retains accepted and thrown provider outcomes until the crash horizon", async () => {
    await expect(
      runTenantProviderWorkWithDeletionFence({
        userId: "user-1",
        retainOnSuccess: (result: { accepted: boolean }) => result.accepted,
        perform: async () => ({ accepted: true }),
      }),
    ).resolves.toMatchObject({ performed: true });
    expect(leaseMocks.release).not.toHaveBeenCalled();

    leaseMocks.acquire.mockResolvedValueOnce({
      id: "lease-2",
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    await expect(
      runTenantProviderWorkWithDeletionFence({
        userId: "user-2",
        perform: async () => {
          throw new Error("ambiguous network outcome");
        },
      }),
    ).rejects.toThrow("ambiguous network outcome");
    expect(leaseMocks.release).not.toHaveBeenCalled();
  });

  it("retains the lease when a success classifier throws", async () => {
    const classificationError = new Error("could not classify provider response");
    await expect(
      runTenantProviderWorkWithDeletionFence({
        userId: "user-1",
        retainOnSuccess: () => {
          throw classificationError;
        },
        perform: async () => ({ providerRequestId: "req-1" }),
      }),
    ).rejects.toBe(classificationError);

    expect(leaseMocks.acquire).toHaveBeenCalledTimes(1);
    expect(leaseMocks.release).not.toHaveBeenCalled();
  });

  it("reuses a same-tenant outer lease and lets a nested call retain it", async () => {
    const nested = vi.fn(async () => ({ accepted: true }));
    await expect(
      runTenantProviderWorkWithDeletionFence({
        userId: "user-1",
        operation: "cadence_provider_step",
        perform: async () => {
          const result = await runTenantProviderWorkWithDeletionFence({
            userId: "user-1",
            operation: "twilio_outbound_call_create",
            retainOnSuccess: (value: { accepted: boolean }) => value.accepted,
            perform: nested,
          });
          expect(result).toEqual({ performed: true, result: { accepted: true } });
          return "step-complete";
        },
      }),
    ).resolves.toEqual({ performed: true, result: "step-complete" });

    expect(nested).toHaveBeenCalledTimes(1);
    expect(leaseMocks.acquire).toHaveBeenCalledTimes(1);
    expect(leaseMocks.release).not.toHaveBeenCalled();
  });

  it("denies provider work when terminal deletion wins admission", async () => {
    leaseMocks.acquire.mockResolvedValueOnce(null);
    const perform = vi.fn(async () => "must-not-run");

    await expect(
      runTenantProviderWorkWithDeletionFence({ userId: "user-1", perform }),
    ).resolves.toEqual({ performed: false, reason: "account_erased_or_terminal_deletion" });
    expect(perform).not.toHaveBeenCalled();
    expect(leaseMocks.release).not.toHaveBeenCalled();
  });

  it("places every exported Twilio outbound call behind the shared lease", () => {
    const source = read("src/lib/voice/outbound-call-service.ts");
    const exported = source.slice(source.indexOf("export async function placeOutboundCall"));

    expect(source.match(/twilio\.calls\.create\(/g)).toHaveLength(1);
    expect(source).toContain("async function placeOutboundCallAfterDeletionFence");
    expect(source).not.toContain("export async function placeOutboundCallAfterDeletionFence");
    expect(exported.indexOf("assertLiveExternalActionAllowed")).toBeLessThan(
      exported.indexOf("runTenantProviderWorkWithDeletionFence"),
    );
    expect(exported).toContain("runTenantProviderWorkWithDeletionFence");
    expect(exported).toContain('operation: "twilio_outbound_call_create"');
    expect(exported).toContain("perform: () => placeOutboundCallAfterDeletionFence(input)");
    expect(exported).toContain("result.ok || result.providerOutcomeAmbiguous");
    expect(exported).toContain("doNotRetry: true");
  });

  it("blocks demo/test external actions before lease admission or provider work", async () => {
    environmentMocks.assertAllowed.mockRejectedValueOnce(
      new Error("Live external actions are disabled in this demo or test workspace."),
    );

    await expect(
      placeOutboundCall({
        userId: "demo-user",
        agentId: "agent-1",
        customerNumber: "+14155550100",
        callPurpose: "callback",
      }),
    ).rejects.toThrow("Live external actions are disabled");

    expect(environmentMocks.assertAllowed).toHaveBeenCalledWith(
      "demo-user",
      "twilio_outbound_call_create",
    );
    expect(leaseMocks.acquire).not.toHaveBeenCalled();
  });
});
