import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ stripeConfigured: true }));

// Load the real public route and launch policy with every billing/database side
// effect disconnected. No authenticated handler or provider SDK call is invoked.
vi.mock("../src/lib/server-context", () => ({}));
vi.mock("../src/db/schema", () => ({}));
vi.mock("../src/db/security-schema", () => ({}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/platform-admin", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("../src/lib/stripe-helpers", () => ({ stripeAvailable: () => h.stripeConfigured }));
vi.mock("../src/lib/email-service", () => ({}));
vi.mock("../src/lib/phone-line-entitlements", () => ({}));
vi.mock("../src/lib/workspace-usage-snapshot", () => ({}));
vi.mock("../src/lib/credit-wallet", () => ({}));
vi.mock("../src/lib/subscription-welcome-credit", () => ({}));
vi.mock("../src/lib/product-event-server", () => ({}));
vi.mock("../src/lib/video-presenter/live-video-entitlements", () => ({}));
vi.mock("../src/lib/agent-entitlements", () => ({}));
vi.mock("../src/lib/auth-service", () => ({}));
vi.mock("../src/lib/stripe-checkout-fulfillment", () => ({}));
vi.mock("../src/lib/stripe-live-video-addon", () => ({}));
vi.mock("../src/lib/account-deletion-billing", () => ({}));
vi.mock("../src/lib/account-environment-policy", () => ({}));
vi.mock("../src/lib/stripe-event-claim", () => ({}));
vi.mock("../src/lib/voice-usage", () => ({}));
vi.mock("../src/lib/spend-guards", () => ({}));

import router from "../src/routes/billing-routes";
import { enforceLaunchHardGate } from "../src/middleware/launch-hard-gate";
import { evaluateLaunchReadiness } from "../src/lib/launch-readiness";

type PublicPlans = {
  plans: Array<{ id: string; configured: boolean; annual_configured: boolean }>;
  stripe_configured: boolean;
  checkout_available: boolean;
};
type RouteLayer = {
  route?: {
    path: string;
    stack: Array<{ handle: (req: Request, res: Response) => unknown }>;
  };
};

function getPublicPlans() {
  const layers = (router as unknown as { stack: RouteLayer[] }).stack;
  const route = layers.find((layer) => layer.route?.path === "/billing/plans")?.route;
  const handler = route?.stack.at(-1)?.handle;
  if (!handler) throw new Error("Public billing catalog route is missing");
  const res = { json: vi.fn(), setHeader: vi.fn() };
  handler({} as Request, res as unknown as Response);
  return { body: res.json.mock.calls[0][0] as PublicPlans, setHeader: res.setHeader };
}

beforeEach(() => {
  h.stripeConfigured = true;
  vi.stubEnv("WIRELINE_SELF_SERVE_BILLING_ENABLED", "true");
  vi.stubEnv("WIRELINE_LAUNCH_DEMO_MODE", "false");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
  vi.stubEnv("LAUNCH_HARD_GATE", "false");
});
afterEach(() => vi.unstubAllEnvs());

describe("public billing checkout availability", () => {
  it("reports an open released checkout without exposing operational details", () => {
    const { body, setHeader } = getPublicPlans();
    expect(body.stripe_configured).toBe(true);
    expect(body.checkout_available).toBe(true);
    expect(body.plans.find((plan) => plan.id === "starter")?.configured).toBe(true);
    expect(Object.keys(body).sort()).toEqual(["checkout_available", "plans", "stripe_configured"]);
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });

  it("reports unavailable when the same hard launch gate rejects checkout despite configured prices", () => {
    vi.stubEnv("LAUNCH_HARD_GATE", "true");
    vi.stubEnv("AGENTMAIL_API_KEY", "");
    expect(evaluateLaunchReadiness().launch_blockers).toContain("AGENTMAIL_API_KEY");

    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);
    const next = vi.fn();
    enforceLaunchHardGate({} as Request, response as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(503);

    const { body } = getPublicPlans();
    expect(body.plans.find((plan) => plan.id === "starter")?.configured).toBe(true);
    expect(body.stripe_configured).toBe(true);
    expect(body.checkout_available).toBe(false);
    expect(body).not.toHaveProperty("launch_blockers");
    expect(body).not.toHaveProperty("capabilities");
    expect(JSON.stringify(body)).not.toContain("AGENTMAIL_API_KEY");
  });

  it.each([
    ["WIRELINE_SELF_SERVE_BILLING_ENABLED", "false"],
    ["WIRELINE_LAUNCH_DEMO_MODE", "true"],
    ["VERCEL_ENV", "preview"],
    ["VERCEL_GIT_COMMIT_REF", "feature"],
  ])("reports unavailable when the production release gate rejects %s=%s", (name, value) => {
    vi.stubEnv(name, value);
    expect(getPublicPlans().body.checkout_available).toBe(false);
  });

  it("reports unavailable when Stripe is not configured", () => {
    h.stripeConfigured = false;
    const { body } = getPublicPlans();
    expect(body.stripe_configured).toBe(false);
    expect(body.checkout_available).toBe(false);
  });

  it("reevaluates gate changes on every request", () => {
    expect(getPublicPlans().body.checkout_available).toBe(true);
    vi.stubEnv("LAUNCH_HARD_GATE", "true");
    vi.stubEnv("AGENTMAIL_API_KEY", "");
    expect(getPublicPlans().body.checkout_available).toBe(false);
    vi.stubEnv("LAUNCH_HARD_GATE", "false");
    expect(getPublicPlans().body.checkout_available).toBe(true);
  });
});
