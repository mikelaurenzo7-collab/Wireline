import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manager = readFileSync("src/components/DncManager.tsx", "utf8");
const routes = readFileSync("src/routes/compliance-routes.ts", "utf8");

describe("DNC route contract", () => {
  it("keeps the compliance UI aligned with the mounted API routes", () => {
    expect(manager).toContain('authFetch("/api/dnc")');
    expect(manager).toContain("authFetch(`/api/dnc/${id}`");
    expect(routes).toContain('router.get("/api/dnc"');
    expect(routes).toContain('router.post("/api/dnc"');
    expect(routes).toContain('"/api/dnc/:id"');
    expect(routes).toContain('"/api/tcpa/consent-check"');
  });
});

/*
 * A Do Not Call list is per-tenant — `isDncBlocked(userId, phone)` — so the
 * mid-call termination it triggers must be too. `terminateActiveCallsForNumber`
 * matched `wireline_signal_presence` on customer_number ALONE, ignoring the
 * table's own non-null user_id. One workspace suppressing a number therefore
 * killed every OTHER workspace's live call with that same person, mid-sentence,
 * on the strength of an opt-out those callers never gave them. Consumer numbers
 * are shared across businesses constantly; this is the ordinary case, not an
 * edge case. All three call sites carry a tenant and must pass it.
 */
describe("mid-call DNC termination stays inside one tenant", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("scopes the live-call lookup to the tenant whose DNC list changed", () => {
    const sentinel = read("src/services/sentinel.ts");
    const fn = sentinel.slice(sentinel.indexOf("async terminateActiveCallsForNumber("));
    expect(fn.slice(0, 1600)).toContain("eq(schema.signalPresence.userId, userId)");
    expect(fn.slice(0, 1600)).toContain(
      "inArray(schema.signalPresence.customerNumber, candidates)",
    );
    // Fail closed rather than fall back to a global match.
    expect(fn.slice(0, 1600)).toContain("!candidates.length || !userId");
  });

  it("passes the tenant from every call site", () => {
    for (const [file, expected] of [
      ["src/routes/compliance-routes.ts", "terminateActiveCallsForNumber(row.phone, req.user.id)"],
      [
        "src/lib/vapi-handlers.ts",
        "terminateActiveCallsForNumber(normalizedCallerNumber, input.userId)",
      ],
      [
        "src/routes/vapi/tool-handlers-core.ts",
        "terminateActiveCallsForNumber(normalizedPhone, agent?.user_id)",
      ],
    ] as const) {
      expect(read(file), file).toContain(expected);
    }
  });
});

/*
 * Two independent signals classify a call as a do-not-call request, and only
 * one of them used to be operative. The transcript matcher writes the tenant
 * DNC row when an opt-out PHRASE matches; the post-call digest tags the outcome
 * "dnc" from a regex over the model's SUMMARY, which catches requests the
 * phrase matcher missed. That second path only set one lead row to Blocked-DNC
 * while isDncBlocked kept answering false, because it reads the DNC list — so a
 * second campaign or a re-import could dial the same person again after they
 * had asked us to stop. Both signals must reach the list.
 */
describe("a dnc-classified outcome suppresses the number, not just the lead", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("writes the tenant DNC row from the summary-classified outcome", () => {
    const tracking = read("src/lib/outbound-call-tracking.ts");
    const arm = tracking.slice(tracking.indexOf('} else if (outcomeTag === "dnc") {'));
    expect(arm.slice(0, 2000)).toContain("insert(schema.dncList)");
    expect(arm.slice(0, 2000)).toContain("normalizeDncPhone(customerNumber)");
    // Idempotent, so redelivery cannot fail the call-end handler.
    expect(arm.slice(0, 2000)).toContain(
      "onConflictDoNothing({ target: [schema.dncList.userId, schema.dncList.phone] })",
    );
  });

  it("keeps the transcript-phrase writer as the other independent path", () => {
    expect(read("src/lib/vapi-handlers.ts")).toContain("persistTranscriptDncSuppression");
  });
});
