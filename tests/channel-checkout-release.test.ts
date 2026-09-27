import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  handlers: [] as Array<(req: any, res: any) => Promise<unknown>>,
  database: vi.fn(),
  priceLookup: vi.fn(),
  customer: vi.fn(),
  checkout: vi.fn(),
}));
vi.mock("express", () => ({
  Router: () => ({
    post: (path: string, ...handlers: any[]) => {
      if (path === "/api/billing/checkout") h.handlers.push(handlers.at(-1));
    },
  }),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: h.database, transaction: h.database, insert: h.database, update: h.database },
  log: { warn: vi.fn(), error: vi.fn() },
  auditLogger: {},
}));
vi.mock("../src/lib/stripe-helpers", () => ({
  stripeAvailable: () => true,
  stripe: {
    prices: { retrieve: h.priceLookup, list: h.priceLookup },
    customers: { create: h.customer },
    checkout: { sessions: { create: h.checkout } },
  },
  isMissingStripeResource: () => false,
  stripeCheckoutIntegrationIdentifier: () => "test",
  stripeCheckoutTaxConfig: () => ({}),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/account-deletion-billing-fence", () => ({
  fencePayableBillingDuringAccountDeletion: vi.fn(),
}));
vi.mock("../src/middleware/launch-hard-gate", () => ({ enforceLaunchHardGate: vi.fn() }));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEvent: vi.fn() }));
vi.mock("../src/lib/stripe-checkout-fulfillment", () => ({
  fulfillStripeCheckoutSession: vi.fn(),
}));
vi.mock("../src/lib/stripe-customer-binding", () => ({ resolveOwnedStripeCustomer: h.customer }));
vi.mock("../src/lib/stripe-subscription-safety", () => ({
  findPotentiallyLiveStripeSubscription: h.customer,
}));
import "../src/routes/launch-billing-checkout-routes";
import "../src/routes/launch-billing-checkout-atomic-routes";
import { planById } from "../src/lib/plan-catalog";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST channel checkout release gate", () => {
  it.each(["voice", "email", "voice-email"])(
    "rejects direct %s requests before database or Stripe while interval IDs are unset",
    async (planId) => {
      const plan = planById(planId)!;
      vi.stubEnv(plan.priceIdEnv!, "");
      vi.stubEnv(plan.annualPriceIdEnv!, " ");
      expect(h.handlers).toHaveLength(2);
      for (const handler of h.handlers) {
        for (const interval of ["month", "year"]) {
          const res = { status: vi.fn(), json: vi.fn() };
          res.status.mockReturnValue(res);
          await handler(
            {
              body: { plan_id: planId, interval },
              user: { id: "pilot", email: "pilot@example.test" },
            },
            res,
          );
          expect(res.status).toHaveBeenCalledWith(503);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ code: "CHANNEL_CHECKOUT_UNAVAILABLE" }),
          );
        }
      }
      expect(h.database).not.toHaveBeenCalled();
      expect(h.priceLookup).not.toHaveBeenCalled();
      expect(h.customer).not.toHaveBeenCalled();
      expect(h.checkout).not.toHaveBeenCalled();
    },
  );
});
