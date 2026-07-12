import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  AGENT_CREATE_DEFAULT_ROLE_ID,
  AGENT_ROLE_DEFINITIONS,
  canonicalizeAgentRoleForCreate,
  listAgentRolesForApi,
  resolveAgentRoleArchetype,
  validateAgentRoleForCreate,
} from "../src/lib/agent-role-definitions";
import { ROLE_PERSONALITY_TEMPLATES } from "../src/lib/agent-constants";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("agent role definitions contract", () => {
  it("covers every personality template role plus custom", () => {
    for (const id of Object.keys(ROLE_PERSONALITY_TEMPLATES)) {
      expect(AGENT_ROLE_DEFINITIONS.map((r) => r.id)).toContain(id);
    }
    expect(AGENT_ROLE_DEFINITIONS.map((r) => r.id)).toContain("custom");
  });

  it("rejects unknown roles for create payloads", () => {
    expect(validateAgentRoleForCreate("not_a_real_role")).toMatch(/Unknown agent role/);
    expect(validateAgentRoleForCreate("sales")).toBeNull();
    expect(validateAgentRoleForCreate("ceo")).toBeNull();
  });

  it("accepts legacy aliases on create", () => {
    expect(validateAgentRoleForCreate("appointment_scheduler")).toBeNull();
    expect(canonicalizeAgentRoleForCreate("appointment_scheduler")).toBe("scheduler");
    expect(canonicalizeAgentRoleForCreate("general_manager")).toBe("ceo");
  });

  it("keeps web and mobile routes on the shared module", () => {
    const web = read("src/routes/agent-routes-v2.ts");
    const mobile = read("src/routes/mobile-routes.ts");
    expect(web).toContain("agent-role-definitions");
    expect(mobile).toContain("agent-role-definitions");
    expect(mobile).toContain("/api/mobile/agents/roles");
    expect(web).toContain("listAgentRolesForApi");
    expect(mobile).toContain("listAgentRolesForApi");
  });

  it("aligns create default and archetype resolution", () => {
    expect(AGENT_CREATE_DEFAULT_ROLE_ID).toBe("ceo");
    expect(resolveAgentRoleArchetype("ceo")).toBe("All-Purpose AI Employee");
    expect(resolveAgentRoleArchetype("general_manager")).toBe("All-Purpose AI Employee");
    expect(listAgentRolesForApi().length).toBe(AGENT_ROLE_DEFINITIONS.length);
  });
});
