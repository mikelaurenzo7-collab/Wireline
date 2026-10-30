import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Stripe event ownership fencing", () => {
  const migration = read("drizzle/migrations/0164_stripe_event_claim_fencing.sql");
  const claim = read("src/lib/stripe-event-claim.ts");
  const billing = read("src/routes/billing-routes.ts");
  const preflight = read("src/middleware/stripe-runtime-allowance-retry.ts");
  it("uses a UUID attempt token and a 15-minute lease", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS claim_token uuid");
    expect(migration).toContain("INTERVAL '15 minutes'");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(claim).toContain("STRIPE_EVENT_CLAIM_LEASE_MS = 15 * 60 * 1000");
  });

  it("fences completion and release by event, state, and attempt token", () => {
    const complete = claim.slice(
      claim.indexOf("export async function completeStripeEventClaim"),
      claim.indexOf("export async function releaseStripeEventClaim"),
    );
    const release = claim.slice(claim.indexOf("export async function releaseStripeEventClaim"));
    for (const operation of [complete, release]) {
      expect(operation).toContain("schema.stripeEvents.eventId, claim.eventId");
      expect(operation).toContain('schema.stripeEvents.status, "processing"');
      expect(operation).toContain("schema.stripeEvents.claimToken, claim.claimToken");
    }
    expect(complete).toContain("lost claim ownership before completion");
  });

  it("routes both webhook consumers through the shared fenced helper", () => {
    for (const source of [billing, preflight]) {
      expect(source).toContain('from "../lib/stripe-event-claim"');
      expect(source).toContain("claimStripeEvent(");
      expect(source).toContain("completeStripeEventClaim(");
      expect(source).toContain("releaseStripeEventClaim(");
    }
    expect(billing).not.toContain("async function claimStripeEvent(");
    expect(preflight).not.toContain("async function claimStripeEventForPreflight(");
  });

  it("mints a distinct UUID token for each successful attempt", async () => {
    vi.resetModules();
    const inserted: Array<Record<string, unknown>> = [];
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {
        insert: () => ({
          values: async (value: Record<string, unknown>) => {
            inserted.push(value);
          },
        }),
      },
    }));
    const { claimStripeEvent } = await import("../src/lib/stripe-event-claim");

    const first = await claimStripeEvent("evt_1", "invoice.paid");
    const second = await claimStripeEvent("evt_2", "invoice.paid");
    expect(first.kind).toBe("claimed");
    expect(second.kind).toBe("claimed");
    const tokens = inserted.map((value) => value.claimToken);
    expect(tokens[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    expect(tokens[1]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    expect(tokens[0]).not.toBe(tokens[1]);
  });

  it("refuses stale-token completion and release while allowing the current owner", async () => {
    async function helpers(ownsClaim: boolean) {
      vi.resetModules();
      const returning = async () => (ownsClaim ? [{ eventId: "evt_1" }] : []);
      const terminal = { returning };
      const where = () => terminal;
      vi.doMock("../src/lib/server-context", () => ({
        drizzle: {
          update: () => ({ set: () => ({ where }) }),
          delete: () => ({ where }),
        },
      }));
      return import("../src/lib/stripe-event-claim");
    }

    const stale = await helpers(false);
    const staleClaim = {
      eventId: "evt_1",
      eventType: "invoice.paid",
      claimToken: "stale",
    };
    await expect(stale.completeStripeEventClaim(staleClaim)).rejects.toThrow(
      "lost claim ownership",
    );
    await expect(stale.releaseStripeEventClaim(staleClaim)).resolves.toBe(false);

    const owner = await helpers(true);
    const ownedClaim = {
      eventId: "evt_1",
      eventType: "invoice.paid",
      claimToken: "current",
    };
    await expect(owner.completeStripeEventClaim(ownedClaim)).resolves.toBeUndefined();
    await expect(owner.releaseStripeEventClaim(ownedClaim)).resolves.toBe(true);
  });
});
