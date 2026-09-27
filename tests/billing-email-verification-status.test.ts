import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ select: vi.fn(), lookup: null as Date | null, unavailable: false }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: h.select },
  log: { error: vi.fn() },
}));
vi.mock("../src/db/schema", () => ({
  subscriptions: {},
  agents: {},
  phoneNumbers: {},
  settings: {},
  users: {},
}));
vi.mock("../src/db/security-schema", () => ({}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/platform-admin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("../src/lib/stripe-helpers", () => ({ stripeAvailable: () => false }));
vi.mock("../src/lib/email-service", () => ({}));
vi.mock("../src/lib/phone-line-entitlements", () => ({ getIncludedPhoneLineSlots: async () => 0 }));
vi.mock("../src/lib/workspace-usage-snapshot", () => ({}));
vi.mock("../src/lib/credit-wallet", () => ({}));
vi.mock("../src/lib/subscription-welcome-credit", () => ({}));
vi.mock("../src/lib/product-event-server", () => ({}));
vi.mock("../src/lib/video-presenter/live-video-entitlements", () => ({}));
vi.mock("../src/lib/agent-entitlements", () => ({
  resolveAgentEntitlement: () => ({ effectiveCap: 1, purchasedExtras: 0 }),
}));
vi.mock("../src/lib/auth-service", () => ({ isOwnerEmail: () => false }));
vi.mock("../src/lib/stripe-checkout-fulfillment", () => ({}));
vi.mock("../src/lib/stripe-live-video-addon", () => ({}));
vi.mock("../src/lib/account-deletion-billing", () => ({}));
vi.mock("../src/lib/account-environment-policy", () => ({}));
vi.mock("../src/lib/stripe-event-claim", () => ({}));
vi.mock("../src/lib/voice-usage", () => ({}));
vi.mock("../src/lib/spend-guards", () => ({}));

import router from "../src/routes/billing-routes";

type RouteLayer = {
  route?: {
    path: string;
    stack: Array<{ handle: (req: Request, res: Response) => Promise<void> }>;
  };
};

async function billingStatus() {
  const layers = (router as unknown as { stack: RouteLayer[] }).stack;
  const handler = layers
    .find((layer) => layer.route?.path === "/billing/status")
    ?.route?.stack.at(-1)?.handle;
  if (!handler) throw new Error("Missing billing status handler");
  const response = { json: vi.fn() };
  await handler(
    { user: { id: "account-a", email: "fixture@example.test" } } as unknown as Request,
    response as unknown as Response,
  );
  return response.json.mock.calls[0][0] as { email_verified: boolean | null; agent_count: number };
}

beforeEach(() => {
  h.lookup = null;
  h.unavailable = false;
  let read = 0;
  // Run the actual handler with its sequential database reads disconnected.
  // Only the final email lookup may fail; no real database or provider is used.
  h.select.mockReset().mockImplementation(() => {
    const index = read++;
    const result = index === 4 ? [{ verifiedAt: h.lookup }] : [];
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      then: (resolve: (value: unknown) => unknown, reject: (error: Error) => unknown) =>
        index === 4 && h.unavailable
          ? Promise.reject(new Error("Verification lookup unavailable")).then(resolve, reject)
          : Promise.resolve(result).then(resolve, reject),
    };
    return chain;
  });
});

describe("billing email verification truthfulness", () => {
  it("reports unknown when the verification lookup fails without discarding other billing data", async () => {
    h.unavailable = true;
    expect(await billingStatus()).toMatchObject({ email_verified: null, agent_count: 0 });
    expect(h.select).toHaveBeenCalledTimes(5);
  });

  it("reports unverified only from a completed lookup", async () => {
    expect((await billingStatus()).email_verified).toBe(false);
  });

  it("reports verified only when the database returns a verification timestamp", async () => {
    h.lookup = new Date("2026-09-27T00:00:00Z");
    expect((await billingStatus()).email_verified).toBe(true);
  });
});
