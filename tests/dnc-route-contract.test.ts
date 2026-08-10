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
