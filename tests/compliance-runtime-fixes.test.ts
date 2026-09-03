import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { dncPhoneCandidates, normalizeDncPhone } from "../src/lib/compliance";

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

// ── Source contracts locking in the fixes ────────────────────────────────────
describe("compliance & runtime fix contracts", () => {
  it("both DNC gates match every stored phone variant (not a naive eq)", () => {
    const compliance = read("src/lib/compliance.ts");
    expect(compliance).toContain("inArray(schema.dncList.phone, candidates)");
    const twilio = read("src/lib/twilio-service.ts");
    expect(twilio).toContain("isDncBlocked(userId, phone)");
    expect(twilio).toContain("return isDncBlocked(userId, phone)");
  });

  it("SMS opt-out handlers write the canonical digits-only DNC key", () => {
    expect(read("src/routes/twilio-webhook-base.ts")).toContain("phone: normalizeDncPhone(from)");
    const consentRoute = read("src/routes/twilio-webhook.ts");
    expect(consentRoute).toContain(
      "const normalizedCustomerNumber = normalizeDncPhone(input.customerNumber)",
    );
    expect(consentRoute).toContain("phone: normalizedCustomerNumber");
  });

  it("the OpenAI tool timeout reports uncertainty and still observes late completion", () => {
    const session = read("src/lib/voice/openai-sip-session.ts");
    const tools = session.slice(session.indexOf("const executePendingTools = async () =>"));
    const operation = tools.indexOf("const operation = dispatchAgentToolCall(");
    const race = tools.indexOf("const outcome = await Promise.race([", operation);
    const timeout = tools.indexOf('if (outcome.kind === "timeout")', race);
    const late = tools.indexOf("void operation.then(", timeout);

    expect(operation).toBeGreaterThan(-1);
    expect(race).toBeGreaterThan(operation);
    expect(timeout).toBeGreaterThan(race);
    expect(late).toBeGreaterThan(timeout);
    expect(tools).toContain("Action confirmation timed out and the outcome is unknown");
  });

  it("shopify_apply_discount does not fabricate success for the unimplemented stub", () => {
    const shopify = read("src/lib/bot-tools/shopify.ts");
    expect(shopify).not.toContain("applied to order ${order_number} successfully");
    expect(shopify).toContain("I can't apply a discount to an order directly on this line.");
  });
});
