import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { dncPhoneCandidates, normalizeDncPhone } from "../src/lib/compliance";
import { withVapiToolTimeout } from "../src/lib/vapi-tool-results";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// ── DNC phone normalization (TCPA) ───────────────────────────────────────────
// Regression: SMS "STOP" opt-outs were stored "+"-prefixed but the outbound-call
// gate queried digits-only, so opted-out consumers could still be robocalled.
// The read path now matches every stored variant.
describe("DNC phone normalization", () => {
  it("normalizeDncPhone reduces to digits only", () => {
    expect(normalizeDncPhone("+1 (415) 555-1234")).toBe("14155551234");
    expect(normalizeDncPhone("")).toBe("");
  });

  it("a legacy '+'-prefixed STOP row is matched when the call gate dials digits-only", () => {
    // isDncBlocked builds candidates from the dialed number "14155551234".
    const candidates = dncPhoneCandidates("14155551234");
    expect(candidates).toContain("+14155551234"); // how SMS STOP historically stored it
    expect(candidates).toContain("14155551234"); // canonical digits-only
  });

  it("a digits-only manual/agent DNC add is matched when the SMS gate queries '+'-prefixed", () => {
    const candidates = dncPhoneCandidates("+14155551234");
    expect(candidates).toContain("14155551234"); // how add_to_dnc / manual import stored it
  });

  it("matches across US 10- and 11-digit country-code forms", () => {
    expect(dncPhoneCandidates("4155551234")).toContain("14155551234"); // 10 -> 11
    expect(dncPhoneCandidates("14155551234")).toContain("4155551234"); // 11 -> 10
  });

  it("ignores empty / too-short input (no accidental broad match)", () => {
    expect(dncPhoneCandidates("")).toEqual([]);
    expect(dncPhoneCandidates("12345")).toEqual([]);
  });
});

// ── Vapi tool-call timeout recovery ──────────────────────────────────────────
// Regression: the .catch was on the inner dispatch, so a >5s tool rejected the
// whole batch (HTTP 500, all tool results lost). withVapiToolTimeout rejects on
// timeout; an *outer* .catch must recover it.
describe("Vapi tool-call timeout", () => {
  it("withVapiToolTimeout rejects with VAPI_TOOL_TIMEOUT so an outer .catch can recover", async () => {
    const never = new Promise<never>(() => {});
    const recovered = await withVapiToolTimeout(never, 10).catch((e) => ({
      fallback: (e as Error).message,
    }));
    expect(recovered).toEqual({ fallback: "VAPI_TOOL_TIMEOUT" });
  });

  it("resolves normally when the work finishes before the timeout", async () => {
    const value = await withVapiToolTimeout(Promise.resolve("ok"), 1000);
    expect(value).toBe("ok");
  });
});

// ── Source contracts locking in the fixes ────────────────────────────────────
describe("compliance & runtime fix contracts", () => {
  it("both DNC gates match every stored phone variant (not a naive eq)", () => {
    const compliance = read("src/lib/compliance.ts");
    expect(compliance).toContain("inArray(schema.dncList.phone, candidates)");
    const twilio = read("src/lib/twilio-service.ts");
    expect(twilio).toContain("dncPhoneCandidates(phone)");
    expect(twilio).toContain("inArray(schema.dncList.phone, candidates)");
  });

  it("SMS opt-out handlers write the canonical digits-only DNC key", () => {
    expect(read("src/routes/twilio-webhook-base.ts")).toContain("phone: normalizeDncPhone(from)");
    expect(read("src/routes/twilio-webhook.ts")).toContain(
      "phone: normalizeDncPhone(customerNumber)",
    );
  });

  it("the Vapi tool-call timeout is caught OUTSIDE the timeout wrapper", () => {
    const route = read("src/routes/vapi-v2.ts");
    expect(route).toContain(").catch((err) => ({");
    // the old bug: .catch attached to the inner dispatch IIFE
    expect(route).not.toContain("}))().catch((err) => ({");
  });

  it("shopify_apply_discount does not fabricate success for the unimplemented stub", () => {
    const shopify = read("src/routes/vapi/tool-handlers-shopify.ts");
    expect(shopify).not.toContain("applied to order ${order_number} successfully");
  });
});
