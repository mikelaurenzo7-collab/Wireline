import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { STRIPE_API_VERSION } from "../src/lib/stripe-api-version";
import {
  evaluateStripeWebhookReadiness,
  getPinnedStripeApiVersion,
} from "../scripts/lib/stripe-webhook-readiness.mjs";
import { getHandledStripeWebhookEvents } from "../scripts/lib/stripe-handled-events.mjs";

function endpoint(overrides: Record<string, unknown> = {}) {
  return {
    id: "we_fixture",
    url: "https://botbound.me/api/stripe-webhook",
    status: "enabled",
    livemode: true,
    api_version: STRIPE_API_VERSION,
    enabled_events: getHandledStripeWebhookEvents(),
    ...overrides,
  };
}
const inventory = (data = [endpoint()], hasMore: boolean | undefined = false) => ({
  ok: true,
  body: { data, has_more: hasMore },
});

describe("Stripe webhook readiness agrees with runtime and provider alignment", () => {
  it("reads the one runtime API pin and accepts an exactly aligned live endpoint", () => {
    expect(getPinnedStripeApiVersion()).toBe(STRIPE_API_VERSION);
    expect(evaluateStripeWebhookReadiness(inventory())).toMatchObject({
      ready: true,
      expectedApiVersion: STRIPE_API_VERSION,
      findings: [],
      canonicalEndpointCount: 1,
    });
  });

  it.each(["2026-07-29.dahlia", null, undefined])(
    "blocks a matched event inventory with API version %s",
    (apiVersion) => {
      const result = evaluateStripeWebhookReadiness(
        inventory([endpoint({ api_version: apiVersion })]),
      );
      expect(result.ready).toBe(false);
      expect(result.identityFindings).toContain("endpoint_api_version_mismatch");
      expect(result.missingEvents).toEqual([]);
      expect(result.extraEvents).toEqual([]);
    },
  );

  it("blocks test mode even when URL, version and events match", () => {
    expect(
      evaluateStripeWebhookReadiness(inventory([endpoint({ livemode: false })])),
    ).toMatchObject({
      ready: false,
      identityFindings: ["endpoint_not_livemode"],
    });
  });

  it("requires exactly one enabled canonical endpoint and ignores disabled history", () => {
    const disabled = endpoint({
      id: "we_disabled",
      status: "disabled",
      api_version: "2026-07-29.dahlia",
    });
    expect(evaluateStripeWebhookReadiness(inventory([endpoint(), disabled])).ready).toBe(true);
    expect(
      evaluateStripeWebhookReadiness(inventory([endpoint(), endpoint({ id: "we_second" })])),
    ).toMatchObject({
      ready: false,
      canonicalEndpointCount: 2,
      identityFindings: ["canonical_endpoint_count_2"],
    });
    expect(
      evaluateStripeWebhookReadiness(
        inventory([endpoint({ url: "https://trywireline.com/api/stripe-webhook" })]),
      ).ready,
    ).toBe(false);
  });

  it("never certifies failed, truncated or inconclusive inventory reads", () => {
    const complete = inventory();
    expect(evaluateStripeWebhookReadiness({ ...complete, ok: false }).identityFindings).toContain(
      "webhook_inventory_unreachable",
    );
    expect(
      evaluateStripeWebhookReadiness(inventory([endpoint()], true)).identityFindings,
    ).toContain("webhook_inventory_truncated");
    const incomplete = { ok: true, body: { data: [endpoint()] } };
    expect(evaluateStripeWebhookReadiness(incomplete)).toMatchObject({
      ready: false,
      identityFindings: ["webhook_inventory_completeness_unknown"],
    });
  });

  it("retains exact event alignment and distinguishes repairable event drift from identity drift", () => {
    const events = getHandledStripeWebhookEvents();
    const result = evaluateStripeWebhookReadiness(
      inventory([
        endpoint({
          enabled_events: [...events.slice(1), "customer.created"],
        }),
      ]),
    );
    expect(result.ready).toBe(false);
    expect(result.identityFindings).toEqual([]);
    expect(result.missingEvents).toEqual([events[0]]);
    expect(result.extraEvents).toEqual(["customer.created"]);
    expect(evaluateStripeWebhookReadiness(inventory(), []).ready).toBe(false);
  });

  it("wires the shared checks and pin into every launch webhook consumer", () => {
    for (const file of [
      "check-vendor-readiness.mjs",
      "generate-launch-status.mjs",
      "align-stripe-webhook-events.mjs",
    ]) {
      const source = readFileSync(resolve("scripts", file), "utf8");
      expect(source, file).toContain("evaluateStripeWebhookReadiness(");
      expect(source, file).toContain("getPinnedStripeApiVersion()");
      expect(source, file).not.toMatch(/(?:API_VERSION|PINNED_STRIPE_API_VERSION) = "\d{4}-/);
    }
  });
});
