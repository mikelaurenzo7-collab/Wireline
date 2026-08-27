import { EventEmitter } from "node:events";

import type { NextFunction, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequest } from "../src/types/auth";

const leaseMocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  release: vi.fn(),
}));
const environmentMocks = vi.hoisted(() => ({ policy: vi.fn() }));

vi.mock("../src/lib/account-operation-lease", () => ({
  BILLING_OPERATION_LEASE_MS: 15 * 60_000,
  acquireAccountOperationLease: leaseMocks.acquire,
  releaseAccountOperationLease: leaseMocks.release,
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: environmentMocks.policy,
}));

import { fencePayableBillingDuringAccountDeletion } from "../src/middleware/account-deletion-billing-fence";

type ResponseHarness = Response & {
  body?: unknown;
  statusCode: number;
};

function responseHarness(): ResponseHarness {
  const emitter = new EventEmitter() as ResponseHarness;
  emitter.headersSent = false;
  emitter.statusCode = 200;
  emitter.status = vi.fn((status: number) => {
    emitter.statusCode = status;
    return emitter;
  }) as Response["status"];
  emitter.json = vi.fn((body: unknown) => {
    emitter.body = body;
    return emitter;
  }) as Response["json"];
  return emitter;
}

const request = {
  user: { id: "11111111-1111-4111-8111-111111111111" },
  method: "POST",
  path: "/api/billing/checkout",
} as AuthenticatedRequest;

describe("payable billing account-operation lease lifecycle", () => {
  beforeEach(() => {
    leaseMocks.acquire.mockReset();
    leaseMocks.release.mockReset();
    environmentMocks.policy.mockReset();
    environmentMocks.policy.mockResolvedValue({ allowed: true, environment: "production" });
    leaseMocks.acquire.mockResolvedValue({
      id: "billing-lease-1",
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    leaseMocks.release.mockResolvedValue(undefined);
  });

  it("releases the lease when the hosted billing response finishes", async () => {
    const res = responseHarness();
    const next = vi.fn();

    await fencePayableBillingDuringAccountDeletion(request, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(leaseMocks.acquire).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: request.user.id,
        kind: "billing",
        operation: "POST /api/billing/checkout",
      }),
    );

    res.emit("finish");
    expect(leaseMocks.release).toHaveBeenCalledOnce();
    expect(leaseMocks.release).toHaveBeenCalledWith({
      id: "billing-lease-1",
      userId: request.user.id,
    });

    // Express can surface close after finish. Listener cleanup and the settled
    // guard must keep release exactly-once.
    res.emit("close");
    expect(leaseMocks.release).toHaveBeenCalledOnce();
  });

  it("retains the lease when the client socket closes ambiguously", async () => {
    const res = responseHarness();
    const next = vi.fn();

    await fencePayableBillingDuringAccountDeletion(request, res, next);
    res.emit("close");
    res.emit("finish");

    expect(next).toHaveBeenCalledOnce();
    expect(leaseMocks.release).not.toHaveBeenCalled();
  });

  it("blocks payable billing when deletion wins admission", async () => {
    leaseMocks.acquire.mockResolvedValueOnce(null);
    const res = responseHarness();
    const next = vi.fn();

    await fencePayableBillingDuringAccountDeletion(request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body).toMatchObject({ code: "ACCOUNT_DELETION_PENDING" });
    expect(res.listenerCount("finish")).toBe(0);
    expect(res.listenerCount("close")).toBe(0);
    expect(leaseMocks.release).not.toHaveBeenCalled();
  });

  it("releases a definitely failed lease when downstream throws synchronously", async () => {
    const res = responseHarness();
    const downstreamError = new Error("checkout handler rejected locally");
    const next = vi
      .fn()
      .mockImplementationOnce(() => {
        throw downstreamError;
      })
      .mockImplementationOnce(() => undefined);

    await fencePayableBillingDuringAccountDeletion(request, res, next as NextFunction);

    expect(leaseMocks.release).toHaveBeenCalledWith({
      id: "billing-lease-1",
      userId: request.user.id,
    });
    expect(next).toHaveBeenNthCalledWith(2, downstreamError);
    expect(res.listenerCount("finish")).toBe(0);
    expect(res.listenerCount("close")).toBe(0);
  });
});
