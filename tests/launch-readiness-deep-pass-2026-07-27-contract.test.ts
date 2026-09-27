import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness deep pass 2026-07-27", () => {
  it("gates phone claim and search on plan capacity", () => {
    const carrier = read("src/routes/native-phone-routing-routes.ts");
    const search = carrier.slice(
      carrier.indexOf('"/api/phone-numbers/search"'),
      carrier.indexOf('"/api/phone-numbers/claim"'),
    );
    expect(search).toContain("await assertNumberCapacity(req.user.id)");
    const capacity = carrier.slice(
      carrier.indexOf("async function assertNumberCapacity"),
      carrier.indexOf("async function queueManagedIdentity"),
    );
    expect(capacity).toContain("PHONE_CAPACITY_REACHED");
    expect(capacity).toContain("getIncludedPhoneLineSlots(userId)");
    expect(capacity).toContain("Number(held || 0) >= slots");

    const claim = carrier.slice(
      carrier.indexOf('"/api/phone-numbers/claim"'),
      carrier.indexOf('"/api/phone-numbers/:id"'),
    );
    expect(claim).toContain("respondWithProvision(req, res");
    expect(carrier).toContain("const result = await provisionNativeTenantNumber({");
  });

  it("re-checks phone capacity under lock after carrier buy", () => {
    const provision = read("src/lib/voice/native-phone-provisioning.ts");
    const persist = provision.slice(
      provision.indexOf("async function persistPurchasedNumber"),
      provision.indexOf("async function activateLine"),
    );
    expect(persist).toContain(
      "const phoneSlots = await getIncludedPhoneLineSlots(input.userId, tx)",
    );
    expect(persist).toContain("Number(held || 0) >= phoneSlots");
    expect(persist.indexOf("getIncludedPhoneLineSlots(input.userId, tx)")).toBeLessThan(
      persist.indexOf("Number(held || 0) >= phoneSlots"),
    );
    expect(persist).toContain('return { kind: "capacity" as const }');
    expect(provision).toContain('persisted.kind === "capacity" ? "PHONE_CAPACITY_RACE"');
    expect(provision).toContain("releasePurchasedNativeNumber");
  });

  it("retires uncapped Assistants seed", () => {
    const fleet = read("src/routes/fleet-routes.ts");
    const seed = fleet.slice(
      fleet.indexOf('"/api/Assistants/seed"'),
      fleet.indexOf('"/api/Assistants/presence"'),
    );
    expect(seed).toContain("FLEET_SEED_RETIRED");
    expect(seed).toContain("410");
    expect(seed).not.toContain("specializedAgents");
  });

  it("fails Meta page fetch honestly instead of empty-success", () => {
    const meta = read("src/routes/oauth/meta.ts");
    expect(meta).not.toContain(".then((r) => (r.ok ? r.json() : { data: [] }))");
    expect(meta).toContain("could not load your Facebook Pages");
    expect(meta).toContain("status(502)");
  });

  it("claims stripe_events before acknowledging allowance reversals", () => {
    const middleware = read("src/middleware/stripe-runtime-allowance-retry.ts");
    const claims = read("src/lib/stripe-event-claim.ts");
    expect(middleware).toContain("claimOrRespondDuplicate");
    expect(middleware).toContain("completeStripeEventClaim");
    expect(middleware).toContain("releaseStripeEventClaim");
    expect(claims).toContain("claimToken: randomUUID()");
    expect(claims).toContain("eq(schema.stripeEvents.claimToken, claim.claimToken)");
    const refund = middleware.slice(
      middleware.indexOf('if (event.type === "charge.refunded")'),
      middleware.indexOf('if (event.type === "charge.dispute.created")'),
    );
    expect(refund.indexOf("claimOrRespondDuplicate")).toBeLessThan(
      refund.indexOf("reverseSubscriptionRuntimeAllowanceForChargeStrict"),
    );
    expect(refund.indexOf("completeStripeEventClaim")).toBeGreaterThan(
      refund.indexOf("reverseSubscriptionRuntimeAllowanceForChargeStrict"),
    );
  });

  it("documents that browser Sentry rides SENTRY_DSN via /api/health/report", () => {
    const prodEnv = read("scripts/check-prod-env.mjs");
    expect(prodEnv).not.toContain('["VITE_SENTRY_DSN"');
    expect(prodEnv).toContain("browser reports via /api/health/report");
    expect(read("src/lib/sentry.ts")).not.toContain("VITE_SENTRY_DSN");
  });

  it("emits onboarding_create_redirect when the create shell routes", () => {
    expect(read("src/lib/product-events.ts")).toContain("onboarding_create_redirect");
    const onboarding = read("src/pages/OnboardingFlow.tsx");
    expect(onboarding).toContain('event: "onboarding_create_redirect"');
    expect(onboarding).toContain("emitProductEventOnce");
  });
});
