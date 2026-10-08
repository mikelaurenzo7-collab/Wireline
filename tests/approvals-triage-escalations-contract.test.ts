import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Approvals triage escalations", () => {
  it("lists recent calls where the live runtime recorded an escalation attempt", () => {
    const fleet = read("src/routes/fleet-routes.ts");
    const triage = fleet.slice(fleet.indexOf('router.get("/api/triage"'));
    const escalations = triage.slice(triage.lastIndexOf("tx\n            .select({"));
    expect(escalations).toContain("eq(schema.callLogs.escalationAttempted, true)");
    expect(escalations).toContain("gte(schema.callLogs.createdAt");

    // The phone runtime records escalate_to_human on the call row itself.
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(session).toContain('if (call.name === "escalate_to_human") escalationAttempted = true;');
  });
});
