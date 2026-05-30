import { describe, expect, it, beforeEach } from "vitest";
import { claimLeadEnrichmentSlot } from "./enrichment-debounce";

describe("claimLeadEnrichmentSlot", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("allows first enqueue for a user+caller pair", async () => {
    expect(await claimLeadEnrichmentSlot("user-a", "+15551111111")).toBe(true);
  });

  it("dedupes repeat calls within the debounce window (memory fallback)", async () => {
    expect(await claimLeadEnrichmentSlot("user-b", "+15552222222")).toBe(true);
    expect(await claimLeadEnrichmentSlot("user-b", "+15552222222")).toBe(false);
  });

  it("normalizes phone formatting for the debounce key", async () => {
    expect(await claimLeadEnrichmentSlot("user-c", "+1 (555) 999-0000")).toBe(true);
    expect(await claimLeadEnrichmentSlot("user-c", "15559990000")).toBe(false);
  });
});
