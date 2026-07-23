import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCallbackDatetime } from "../src/lib/callback-engine";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * schedule_callback used to be a broken promise: the agent said "Callback
 * securely scheduled" while the only write was a display-only task row with
 * the datetime buried in a description string — nothing ever dialed back.
 * This contract pins the full execution chain: structured persistence →
 * sweep-enqueued callback_tick → gated dial through the shared TCPA gate.
 */
describe("caller-requested callbacks execute end-to-end", () => {
  it("tool handler persists a structured, executable callback", () => {
    const handler = read("src/routes/vapi/tool-handlers-workflow.ts");
    expect(handler).toContain("parseCallbackDatetime");
    expect(handler).toContain("callbackScheduledAt: dueAt");
    expect(handler).toContain("dueDate: dueAt");
    // The old fictional promise stays gone.
    expect(handler).not.toContain("Callback securely scheduled");
  });

  it("sweep enqueues the callback tick and the worker executes it", () => {
    expect(read("src/routes/job-routes.ts")).toContain('type: "callback_tick"');
    expect(read("src/lib/job-worker-base.ts")).toContain("tickDueCallbacks");
    expect(read("src/lib/job-queue-base.ts")).toContain('"callback_tick"');
  });

  it("every callback dial passes the shared outbound gate and spend controls", () => {
    const engine = read("src/lib/callback-engine.ts");
    expect(engine).toContain("evaluateOutboundDialGate");
    expect(engine).toContain("isRequestedCallback: true");
    expect(engine).toContain("assertOutboundVoiceAllowed");
    expect(engine).toContain("placeOutboundCall");
  });

  it("requested callbacks stay tenant-DNC-protected in the shared gate", () => {
    const gate = read("src/lib/outbound-dial-gate.ts");
    // The flag must skip ONLY the duplicate window + marketing consent,
    // never the tenant DNC lookup — a caller who lands on DNC after requesting
    // a callback stays protected.
    expect(gate).toContain("isRequestedCallback");
    const dncCheck = gate.indexOf("isDncBlocked");
    expect(dncCheck).toBeGreaterThan(-1);
    expect(gate.slice(dncCheck - 400, dncCheck)).not.toContain("isRequestedCallback");
  });

  it("requested callbacks are ALSO blocked by the federal DNC registry", () => {
    // evaluateOutboundConsent skips its federal-DNC block for non-marketing
    // calls (which callbacks are), so the gate must enforce federal DNC
    // explicitly for the callback path — fail-closed, matching the platform.
    const gate = read("src/lib/outbound-dial-gate.ts");
    expect(gate).toMatch(/isRequestedCallback\s*&&\s*isFederalDnc/);
    expect(gate).toContain("federal_dnc_blocked");
  });

  it("the callback tick atomically claims a lead before dialing (no double-dial)", () => {
    const engine = read("src/lib/callback-engine.ts");
    // A claim UPDATE that clears callback_scheduled_at (guarded by isNotNull)
    // and RETURNS the row makes a concurrent/retried tick skip an already-
    // claimed lead instead of dialing the caller twice.
    expect(engine).toMatch(/isNotNull\(schema\.outboundLeads\.callbackScheduledAt\)/);
    expect(engine).toContain("if (!claimed.length) continue;");
    // Both deferral paths (quiet hours + voice controls) share a bounded helper.
    expect(engine).toContain("deferOrDrop");
  });
});

describe("parseCallbackDatetime", () => {
  const now = new Date("2026-07-23T12:00:00Z");

  it("accepts a valid future ISO datetime", () => {
    const parsed = parseCallbackDatetime("2026-07-24T15:00:00Z", now);
    expect(parsed?.toISOString()).toBe("2026-07-24T15:00:00.000Z");
  });

  it("clamps past datetimes to a minimum lead time instead of dialing immediately", () => {
    const parsed = parseCallbackDatetime("2026-07-23T09:00:00Z", now);
    expect(parsed?.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
  });

  it("clamps absurd horizons to 30 days", () => {
    const parsed = parseCallbackDatetime("2027-12-01T00:00:00Z", now);
    expect(parsed?.getTime()).toBe(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  });

  it("returns null for garbage so callers can fall back honestly", () => {
    expect(parseCallbackDatetime("tomorrow-ish", now)).toBeNull();
    expect(parseCallbackDatetime("", now)).toBeNull();
    expect(parseCallbackDatetime(undefined, now)).toBeNull();
    expect(parseCallbackDatetime(42, now)).toBeNull();
  });
});
