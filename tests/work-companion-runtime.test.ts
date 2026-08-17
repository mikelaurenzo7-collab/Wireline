import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  formatWorkCompanionCallPrep,
  isWorkCompanionKind,
  normalizeWorkCompanionBrief,
  WORK_COMPANION_KINDS,
} from "../src/lib/work-companion-runtime";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("work companion runtime", () => {
  it("exposes the prep kinds without send or dial actions", () => {
    expect([...WORK_COMPANION_KINDS]).toEqual([
      "outbound_research",
      "talent_scout",
      "paid_media",
      "creative",
      "account_health",
      "call_brief",
    ]);
    expect(isWorkCompanionKind("call_brief")).toBe(true);
    expect(isWorkCompanionKind("dial")).toBe(false);
  });

  it("formats a compact CALL PREP block from reviewable fields", () => {
    const brief = normalizeWorkCompanionBrief("call_brief", "Acme", {
      facts: ["Acme asked for a Tuesday callback"],
      inferences: ["They may be comparing vendors"],
      pending_approval: ["Do not offer a discount"],
      unresolved: ["Who is the decision maker?"],
      call_objective: "Confirm the Tuesday callback and the decision maker.",
    });
    const block = formatWorkCompanionCallPrep(brief);
    expect(block).toContain("## CALL PREP");
    expect(block).toContain("Confirm the Tuesday callback");
    expect(block).toContain("Acme asked for a Tuesday callback");
    expect(block).toContain("Who is the decision maker?");
    expect(block).not.toMatch(/grok bot/i);
  });

  it("keeps companion routes authenticated, gated, and registered", () => {
    const routes = read("src/routes/work-companion-routes.ts");
    const registry = read("src/server/register-api-routes.ts");
    const runtime = read("src/lib/work-companion-runtime.ts");
    const outbound = read("src/lib/vapi-client.ts");
    expect(registry).toContain("workCompanionRouter");
    expect(routes).toContain('"/api/work-companions"');
    expect(routes).toContain('"/api/work-companions/runs"');
    expect(routes).toContain("authenticateUser");
    expect(routes).toContain("enforceLaunchHardGate");
    expect(routes).toContain("enforceSpendCap");
    expect(routes).toContain('withAudit("work_companions.run")');
    expect(runtime).toContain("Never send email, never dial");
    expect(outbound).toContain("loadWorkCompanionCallPrep");
    expect(outbound).toContain("callPrep");
  });
});
