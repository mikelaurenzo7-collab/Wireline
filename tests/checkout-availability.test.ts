import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../src/lib/api", () => ({ authFetch: h.fetch }));

import {
  fetchSelfServeCheckoutAvailable,
  isBillingSettingsPath,
  isSelfServeCheckoutAvailable,
} from "../src/lib/checkout-availability";

afterEach(() => h.fetch.mockReset());

describe("self-serve checkout availability helper", () => {
  it("opens only when the server explicitly reports checkout and Stripe", () => {
    expect(
      isSelfServeCheckoutAvailable({ checkout_available: true, stripe_configured: true }),
    ).toBe(true);
    expect(
      isSelfServeCheckoutAvailable({ checkout_available: false, stripe_configured: true }),
    ).toBe(false);
    expect(
      isSelfServeCheckoutAvailable({ checkout_available: true, stripe_configured: false }),
    ).toBe(false);
    expect(isSelfServeCheckoutAvailable({ checkout_available: true })).toBe(false);
    expect(isSelfServeCheckoutAvailable(null)).toBe(false);
  });

  it("treats billing settings links as the paid-activation recovery path", () => {
    expect(isBillingSettingsPath("/settings/billing")).toBe(true);
    expect(isBillingSettingsPath("/settings/billing?plan=starter")).toBe(true);
    expect(isBillingSettingsPath("/phone")).toBe(false);
    expect(isBillingSettingsPath(null)).toBe(false);
  });

  it("fails closed when the catalog cannot be read", async () => {
    h.fetch.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchSelfServeCheckoutAvailable()).resolves.toBe(false);

    h.fetch.mockResolvedValueOnce(new Response("nope", { status: 503 }));
    await expect(fetchSelfServeCheckoutAvailable()).resolves.toBe(false);

    h.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ checkout_available: false, stripe_configured: true })),
    );
    await expect(fetchSelfServeCheckoutAvailable()).resolves.toBe(false);

    h.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ checkout_available: true, stripe_configured: true })),
    );
    await expect(fetchSelfServeCheckoutAvailable()).resolves.toBe(true);
  });
});
