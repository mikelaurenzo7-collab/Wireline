import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * The mobile dial route (/api/mobile/calls/outbound) must not drift from the
 * hardened atomic web route. Both place non-idempotent Vapi calls that can burn
 * PSTN spend and carry TCPA consent artifacts, so both must:
 *   - normalize to E.164 BEFORE the duplicate-suppression gate,
 *   - hold (not release) the reservation on an ambiguous provider outcome,
 *   - reconcile — not 500 — when persistence fails after the carrier accepted.
 */
describe("mobile outbound dial mirrors the atomic web reconciliation", () => {
  const mobile = read("src/routes/mobile-routes.ts");

  it("normalizes to E.164 before evaluating the dial gate", () => {
    const normalizeIndex = mobile.indexOf("normalizeOutboundNumber(customerNumber)");
    const gateIndex = mobile.indexOf("evaluateOutboundDialGate({");
    expect(normalizeIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeGreaterThan(normalizeIndex);
    // The gate must receive the normalized value, never the raw client string.
    const gateCall = mobile.slice(gateIndex, gateIndex + 200);
    expect(gateCall).toContain("phone: phoneE164");
  });

  it("holds the reservation and returns 202 on an ambiguous provider outcome", () => {
    expect(mobile).toContain("if (!result.ok || !result.callId)");
    expect(mobile).toContain("isAmbiguousProviderResult(result)");
    expect(mobile).toContain('failureCode: "provider_outcome_ambiguous"');
    expect(mobile).toContain('code: "DIAL_STATUS_UNCERTAIN"');
  });

  it("reconciles instead of 500-ing when persistence fails after carrier acceptance", () => {
    expect(mobile).toContain('failureCode: "post_provider_persistence_failed"');
    expect(mobile).toContain('code: "DIAL_ACCEPTED_RECONCILING"');
    // Lead + reservation completion must be one transaction so a live marketing
    // call never lands without its consent row.
    const txIndex = mobile.indexOf("drizzle.transaction(async (tx) => {");
    const leadIndex = mobile.indexOf("tx.insert(schema.outboundLeads)");
    const completionIndex = mobile.indexOf('status: "completed"');
    expect(txIndex).toBeGreaterThan(-1);
    expect(leadIndex).toBeGreaterThan(txIndex);
    expect(completionIndex).toBeGreaterThan(leadIndex);
  });

  it("shares one ambiguity definition with the atomic web route", () => {
    const web = read("src/routes/outbound-dial-atomic-routes.ts");
    const client = read("src/lib/vapi-client.ts");
    expect(client).toContain("export function isAmbiguousProviderResult");
    expect(web).toContain("isAmbiguousProviderResult");
    expect(mobile).toContain("isAmbiguousProviderResult");
    // No route redefines it locally.
    expect(web).not.toContain("function isAmbiguousProviderResult");
    expect(mobile).not.toContain("function isAmbiguousProviderResult");
  });
});
