import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("../src/lib/integrations-registry", () => ({
  INTEGRATIONS: [],
  getIntegrationsStatus: h.status,
}));

import {
  buyerTierForIntegration,
  getCertifiedIntegrationsPublic,
} from "../src/lib/integrations-certification";

describe("public integration configuration truth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-17T19:00:00.000Z"));
    h.status.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not certify a configured provider without an operational receipt", async () => {
    h.status.mockReturnValue([{ id: "twilio", label: "Twilio", status: "configured" }]);

    expect(await getCertifiedIntegrationsPublic()).toEqual([
      {
        id: "twilio",
        label: "Twilio",
        buyer_tier: "supported",
        status: "configured",
        certified: false,
        last_checked_at: null,
        configuration_checked_at: "2026-10-17T19:00:00.000Z",
        verification_status: "not_performed",
      },
    ]);
  });

  it("preserves missing and fallback configuration while withholding verification", async () => {
    h.status.mockReturnValue([
      { id: "stripe", label: "Stripe", status: "missing" },
      { id: "docusign", label: "DocuSign", status: "fallback" },
    ]);

    const rows = await getCertifiedIntegrationsPublic();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ buyer_tier: "supported", status: "missing" });
    expect(rows[1]).toMatchObject({ buyer_tier: "beta", status: "fallback" });
    expect(rows.every((row) => row.certified === false && row.last_checked_at === null)).toBe(true);
  });

  it("keeps internal integrations and environment details out of the public result", async () => {
    h.status.mockReturnValue([
      {
        id: "openai",
        label: "OpenAI",
        status: "configured",
        envVars: [{ name: "OPENAI_API_KEY", present: true }],
      },
      { id: "secret-vault", label: "Secret vault", status: "configured" },
    ]);

    const rows = await getCertifiedIntegrationsPublic();
    expect(rows.map((row) => row.id)).toEqual(["openai"]);
    expect(rows[0]).not.toHaveProperty("envVars");
    expect(buyerTierForIntegration("secret-vault")).toBe("internal");
  });

  it("does not make provider probes when evaluating the public configuration", async () => {
    const fetch = vi.fn(() => {
      throw new Error("Public configuration must not call a provider.");
    });
    vi.stubGlobal("fetch", fetch);
    h.status.mockReturnValue([{ id: "stripe", label: "Stripe", status: "configured" }]);

    await getCertifiedIntegrationsPublic();

    expect(h.status).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
