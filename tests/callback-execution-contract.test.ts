import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALLBACK_REQUEST_MARKER,
  isConsumerRequestedCallback,
  nextCallbackLeadMetadata,
  parseCallbackDatetime,
  stripCallbackRequestMarker,
} from "../src/lib/callback-engine";

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
    expect(engine).toContain("assertOutboundVoiceAllowed");
    expect(engine).toContain("placeOutboundCall");
  });

  /*
   * The engine selects on a due `callback_scheduled_at` alone, and two writers
   * set that column for leads no consumer ever spoke to: the intake
   * quiet-hours deferral (intake-routes.ts) and the summary-regex "followup"
   * outcome (outbound-call-tracking.ts). While the engine hardcoded
   * `isRequestedCallback: true`, both were dialed as consented callbacks —
   * express written consent synthesized, marketing classification dropped, and
   * with it the 47 CFR 64.1200(b)(3) opt-out announcement. A consentless cold
   * marketing lead submitted at 22:30 local went out the next morning; the
   * same lead submitted at 10:00 was hard-blocked. Time of day is not consent.
   */
  it("claims the callback consent class only from the consumer's own request", () => {
    const engine = read("src/lib/callback-engine.ts");
    const handler = read("src/routes/vapi/tool-handlers-workflow.ts");
    const intake = read("src/routes/intake-routes.ts");

    // Read from the lead, never assumed.
    expect(engine).not.toMatch(/isRequestedCallback:\s*true/);
    expect(engine).toContain("isRequestedCallback: consumerRequested");
    expect(engine).toContain("isConsumerRequestedCallback(metadata)");

    // Only a live call writes the marker.
    expect(handler).toContain('[CALLBACK_REQUEST_MARKER]: "phone_call"');
    // ...and intake metadata is stored verbatim, so it must be stripped there
    // or the account holder could assert it over HTTP.
    expect(intake).toContain("k !== CALLBACK_REQUEST_MARKER");
    // The bulk lead import stores account-holder metadata verbatim too — the
    // same trust boundary, one route over. An imported cold list carrying the
    // marker would dial as consented callbacks after any writer of
    // callback_scheduled_at touched the rows.
    const bulk = read("src/routes/outbound-routes.ts");
    expect(bulk).toContain("stripCallbackRequestMarker((lead.metadata as Record<string, unknown>)");

    // Without the marker the dial stays marketing-classed, which is what keeps
    // the opt-out announcement on (vapi-client isMarketingCallPurpose).
    expect(engine).toContain('consumerRequested ? "callback" : "marketing_or_sales"');
  });

  /*
   * One request authorizes one return call. The marker survived the placed
   * callback (`finish` re-wrote metadata with it intact), so the next
   * summary-inferred "followup" — scheduled 24h later by a regex, not a person
   * — re-read the stale marker and went out with consent waived and the
   * opt-out announcement dropped. The consumer asked once, for a call they
   * already received; nothing they said authorized the second one.
   */
  it("consumes the consumer's request on every terminal outcome", () => {
    const engine = read("src/lib/callback-engine.ts");
    expect(engine).toContain("export function stripCallbackRequestMarker");
    expect(engine).toContain("export function nextCallbackLeadMetadata");
    // finish() owns the rule so no individual call site can forget it, and it
    // delegates to the pure function exercised behaviourally below rather than
    // inlining the logic where only a substring could vouch for it.
    expect(engine).toContain("const nextMetadata = nextCallbackLeadMetadata({");
    expect(engine).toContain("terminal: patch.callbackScheduledAt === null,");
  });

  /*
   * Reading the flag instead of asserting it re-arms the gate's 24h duplicate
   * window for this path. `outbound-call-tracking.ts` schedules inferred
   * follow-ups at exactly lastCalledAt + 24h, so they land on the boundary and
   * return `self_recent_call_scheduled` — which the engine treats as terminal.
   * Left alone, the consent fix would have silently retired every follow-up.
   */
  it("defers reasons that expire on their own instead of retiring the lead", () => {
    const engine = read("src/lib/callback-engine.ts");
    expect(engine).toContain('gate.reason === "outside_permitted_calling_hours"');
    expect(engine).toContain('gate.reason === "self_recent_call_scheduled"');
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

/*
 * The marker rule decides whether a later system-scheduled dial may claim a
 * consumer's consent — waiving express written consent and dropping the 47 CFR
 * 64.1200(b)(3) opt-out announcement. That is too consequential to verify only
 * by reading the source for a substring, so the decision is a pure function and
 * these exercise it directly.
 */
describe("callback marker lifecycle", () => {
  const REQUESTED = { [CALLBACK_REQUEST_MARKER]: "phone_call", callback_notes: "ring me at 4" };

  it("recognises only a real, non-empty provenance stamp", () => {
    expect(isConsumerRequestedCallback(REQUESTED)).toBe(true);
    expect(isConsumerRequestedCallback({})).toBe(false);
    expect(isConsumerRequestedCallback({ [CALLBACK_REQUEST_MARKER]: "" })).toBe(false);
    expect(isConsumerRequestedCallback({ [CALLBACK_REQUEST_MARKER]: "   " })).toBe(false);
    // A truthy non-string must not pass — an imported row could carry anything.
    expect(isConsumerRequestedCallback({ [CALLBACK_REQUEST_MARKER]: true })).toBe(false);
    expect(isConsumerRequestedCallback({ [CALLBACK_REQUEST_MARKER]: 1 })).toBe(false);
  });

  it("strips only the marker and leaves the rest of the row intact", () => {
    const stripped = stripCallbackRequestMarker(REQUESTED);
    expect(stripped).toEqual({ callback_notes: "ring me at 4" });
    // Untouched metadata is returned as-is, so a no-op write stays a no-op.
    const clean = { callback_notes: "x" };
    expect(stripCallbackRequestMarker(clean)).toBe(clean);
  });

  it("keeps the request alive across a deferral", () => {
    // A quiet-hours roll-forward has not used the request yet.
    const patch = { ...REQUESTED, callback_deferrals: 3 };
    expect(
      nextCallbackLeadMetadata({ terminal: false, patchMetadata: patch, leadMetadata: REQUESTED }),
    ).toBe(patch);
  });

  it("consumes the request on every terminal outcome", () => {
    // Placed / dropped: the caller supplies a patch built from the lead.
    expect(
      nextCallbackLeadMetadata({
        terminal: true,
        patchMetadata: { ...REQUESTED, callback_deferrals: 0 },
        leadMetadata: REQUESTED,
      }),
    ).toEqual({ callback_notes: "ring me at 4", callback_deferrals: 0 });

    // Blocked / failed: no patch, so the lead's own metadata is rewritten.
    expect(nextCallbackLeadMetadata({ terminal: true, leadMetadata: REQUESTED })).toEqual({
      callback_notes: "ring me at 4",
    });

    // A gate patch carries the marker forward from the lead; strip it too.
    expect(
      nextCallbackLeadMetadata({
        terminal: true,
        patchMetadata: { ...REQUESTED, tcpa: { allowed: false } },
        leadMetadata: REQUESTED,
      }),
    ).toEqual({ callback_notes: "ring me at 4", tcpa: { allowed: false } });
  });

  it("writes nothing when a terminal outcome has no marker and no patch", () => {
    // Avoids rewriting an untouched jsonb column on every non-consumer dial.
    expect(
      nextCallbackLeadMetadata({ terminal: true, leadMetadata: { callback_deferrals: 2 } }),
    ).toBeUndefined();
  });

  it("never leaves the marker behind on any terminal path", () => {
    for (const patchMetadata of [undefined, { ...REQUESTED }, { ...REQUESTED, extra: 1 }]) {
      const next = nextCallbackLeadMetadata({
        terminal: true,
        patchMetadata,
        leadMetadata: REQUESTED,
      });
      expect(next && CALLBACK_REQUEST_MARKER in next, JSON.stringify(patchMetadata)).toBeFalsy();
    }
  });
});
