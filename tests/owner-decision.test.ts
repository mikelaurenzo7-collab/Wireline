import { describe, expect, it } from "vitest";

import { ownerDecisionRequestFor } from "../src/lib/owner-decision";

/**
 * One place decides what the message review is asked about the owner, for the
 * tools a Bot uses during a call and for the text it sends after one. They
 * used to decide separately, and could have drifted apart.
 */
const rules = { checkFirst: ["A customer asks for a refund", "  ", "A quote over $500"] };

describe("what the review is asked about the owner", () => {
  it.each([
    ["a Bot on Auto", { agentLevel: "auto", tenantLevel: "draft" }],
    ["a Bot that follows a workspace on Auto", { agentLevel: "inherit", tenantLevel: "auto" }],
    ["a Bot nobody set a level for", { agentLevel: null, tenantLevel: null }],
    ["a Bot with nothing stored at all", {}],
  ])("asks it to decide for %s, with the owner's rules", (_name, levels) => {
    expect(ownerDecisionRequestFor(levels, rules)).toEqual({
      rules: ["A customer asks for a refund", "A quote over $500"],
    });
    // A Bot nobody gave rules to still decides, on the review's own criteria.
    expect(ownerDecisionRequestFor(levels, null)).toEqual({ rules: [] });
  });

  it.each([
    ["a Bot set to never ask", { agentLevel: "full", tenantLevel: "auto" }],
    [
      "a Bot that follows a workspace set to never ask",
      { agentLevel: "inherit", tenantLevel: "full" },
    ],
  ])("asks only about the owner's own rules for %s", (_name, levels) => {
    expect(ownerDecisionRequestFor(levels, rules)).toEqual({
      rules: ["A customer asks for a refund", "A quote over $500"],
      rulesOnly: true,
    });
    // With no rules there is nothing to ask: the Bot's own judgement is not wanted.
    for (const playbook of [null, undefined, {}, { checkFirst: [] }, "not a playbook"]) {
      expect(ownerDecisionRequestFor(levels, playbook)).toBeUndefined();
    }
  });

  it.each([
    ["check before customer messages", { agentLevel: "supervised", tenantLevel: "auto" }],
    ["check before everything", { agentLevel: "draft", tenantLevel: "auto" }],
    ["a workspace that checks first", { agentLevel: "inherit", tenantLevel: "draft" }],
    // An unreadable setting waits for the owner; it is never read as permission.
    ["a stored value this release cannot read", { agentLevel: "sometimes", tenantLevel: "auto" }],
  ])("asks nothing for %s, where the message waits anyway", (_name, levels) => {
    expect(ownerDecisionRequestFor(levels, rules)).toBeUndefined();
  });
});
