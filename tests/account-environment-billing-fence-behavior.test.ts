import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireLease: vi.fn(),
  releaseLease: vi.fn(),
}));

vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: vi.fn(async () => ({
    allowed: false,
    environment: "demo",
    status: 403,
    code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
    message: "Live external actions are disabled in this demo or test workspace.",
  })),
}));

vi.mock("../src/lib/account-operation-lease", () => ({
  acquireAccountOperationLease: mocks.acquireLease,
  releaseAccountOperationLease: mocks.releaseLease,
  BILLING_OPERATION_LEASE_MS: 15 * 60_000,
}));

import { fencePayableBillingDuringAccountDeletion } from "../src/middleware/account-deletion-billing-fence";

describe("billing account-environment fence", () => {
  it("blocks a demo account before it acquires a billing lease or reaches Stripe", async () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();

    await fencePayableBillingDuringAccountDeletion(
      { user: { id: "demo-user" }, method: "POST", path: "/api/billing/checkout" } as never,
      { status } as never,
      next,
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
      error: "Live external actions are disabled in this demo or test workspace.",
    });
    expect(mocks.acquireLease).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
