import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCallContext } from "../src/lib/agent-tool-types";

const h = vi.hoisted(() => ({
  entitlements: vi.fn(),
  cached: vi.fn(),
  cacheWrite: vi.fn(),
  connections: vi.fn(),
}));

vi.mock("../src/lib/channel-entitlements", () => ({
  getTenantChannelEntitlements: h.entitlements,
}));
vi.mock("../src/lib/tenant-tools-cache", () => ({
  getCachedTenantToolDefs: h.cached,
  setCachedTenantToolDefs: h.cacheWrite,
}));
vi.mock("../src/lib/tenant-integration-connections", () => ({
  loadTenantIntegrationConnections: h.connections,
  // Connection filtering is separately covered; isolate channel authority here.
  filterToolsByTenantConnections: (names: string[]) => names,
}));

import {
  buildRoleToolDefs,
  buildRoleToolDefsForTenant,
  AGENT_TOOL_DEFS,
  ROLE_SPECIFIC_PROTOCOLS,
} from "../src/lib/agent-runtime-helpers";
import {
  isAgentToolExecutionAuthorized,
  NO_TENANT_INTEGRATIONS,
  resolveAuthorizedAgentTools,
} from "../src/lib/agent-tool-authorization";

const selected = ["send_email", "send_text_message", "search_knowledge_base"] as const;
const privateLiveReads = [
  "search_leads",
  "crm_search_contacts",
  "view_recent_interactions",
  "square_lookup_order",
  "square_lookup_customer",
] as const;
const callerLinkedLiveWrites = ["update_lead_status", "crm_log_call", "schedule_callback"] as const;
const unverifiedLiveTools = [
  ...privateLiveReads,
  ...callerLinkedLiveWrites,
  "square_create_payment_link",
] as const;
const legacyFounderCsTools = [
  "send_signup_link",
  "send_payment_link",
  "schedule_callback",
  "escalate_to_human",
] as const;
const flags = { twilioMessaging: true, twilioLookup: false };
const names = (tools: object[]) => tools.map((tool) => (tool as { name: string }).name);

function context(enabledTools: unknown = selected) {
  const row = {
    id: "agent-pilot",
    enabledTools,
    twilioMessagingEnabled: true,
    twilioLookupEnabled: false,
    aiTier: "standard",
  };
  const query = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([row]),
  };
  const drizzle = { select: vi.fn(() => query) };
  return {
    toolCallId: "tool-1",
    agent: { id: "agent-pilot", user_id: "user-pilot" },
    message: { call: { id: "call-pilot" } },
    payload: {},
    drizzle,
    log: { warn: vi.fn(), error: vi.fn() },
  } as unknown as ToolCallContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.entitlements.mockResolvedValue({ channels: ["voice"] });
  h.cached.mockResolvedValue(null);
  h.cacheWrite.mockResolvedValue(undefined);
  h.connections.mockResolvedValue(NO_TENANT_INTEGRATIONS);
});

describe("live tool channel entitlements", () => {
  it("gives the exact legacy founder specialist a manual follow-up tool before seed repair", async () => {
    const local = names(buildRoleToolDefs("BotBound Specialist", legacyFounderCsTools));
    const fresh = names(
      await buildRoleToolDefsForTenant(
        "BotBound Specialist",
        legacyFounderCsTools,
        "user-pilot",
        "standard",
        flags,
      ),
    );

    expect(local).toContain("create_followup_task");
    expect(fresh).toContain("create_followup_task");
    expect(local).not.toContain("schedule_callback");
    expect(fresh).not.toContain("schedule_callback");
  });

  it("adds manual follow-up to a stale cached founder specialist schema", async () => {
    h.cached.mockResolvedValue(legacyFounderCsTools.map((name) => ({ name })));
    const namesFromCache = names(
      await buildRoleToolDefsForTenant(
        "BotBound Specialist",
        legacyFounderCsTools,
        "user-pilot",
        "standard",
        flags,
      ),
    );

    expect(namesFromCache).toContain("create_followup_task");
    expect(namesFromCache).not.toContain("schedule_callback");
  });

  it("omits unverified private reads, writes, and quick pay from a newly built model schema", async () => {
    const persisted = [...unverifiedLiveTools, "search_knowledge_base"];
    expect(names(buildRoleToolDefs("front_desk", persisted))).toEqual(["search_knowledge_base"]);
    expect(
      names(
        await buildRoleToolDefsForTenant("front_desk", persisted, "user-pilot", "standard", flags),
      ),
    ).toEqual(["search_knowledge_base"]);
  });

  it("strips stale cached unverified tools even when selected before the safety change", async () => {
    const persisted = [...unverifiedLiveTools, "search_knowledge_base"];
    h.cached.mockResolvedValue(persisted.map((name) => ({ name })));
    expect(
      names(
        await buildRoleToolDefsForTenant("front_desk", persisted, "user-pilot", "standard", flags),
      ),
    ).toEqual(["search_knowledge_base"]);
    expect(h.connections).not.toHaveBeenCalled();
    expect(h.cacheWrite).not.toHaveBeenCalled();
  });

  it("denies submitted unverified tools despite their persisted selection", async () => {
    const ctx = context(unverifiedLiveTools);
    for (const name of unverifiedLiveTools) {
      await expect(isAgentToolExecutionAuthorized(name, ctx)).resolves.toBe(false);
    }
  });

  it("requires explicit recipient confirmation in the customer email schema", () => {
    expect(AGENT_TOOL_DEFS.send_email.parameters.required).toContain("email_confirmed");
    expect(AGENT_TOOL_DEFS.send_email.parameters.properties.email_confirmed.type).toBe("boolean");
    expect(AGENT_TOOL_DEFS.send_email.parameters.properties.email_confirmed.description).toContain(
      "reading back the exact address and the caller confirms it",
    );
  });

  it("does not instruct the scheduling role to promise an unavailable email", () => {
    expect(ROLE_SPECIFIC_PROTOCOLS.scheduler).toContain("When send_email is available");
    expect(ROLE_SPECIFIC_PROTOCOLS.scheduler).toContain("the caller requests an email");
    expect(ROLE_SPECIFIC_PROTOCOLS.scheduler).toContain("confirm their email address");
    expect(ROLE_SPECIFIC_PROTOCOLS.scheduler).toContain("after the send tool confirms success");
    expect(ROLE_SPECIFIC_PROTOCOLS.scheduler).toContain("create_followup_task when available");
    expect(ROLE_SPECIFIC_PROTOCOLS.scheduler).toContain("only after that tool confirms creation");
    expect(ROLE_SPECIFIC_PROTOCOLS.scheduler).not.toContain("send the calendar invite immediately");
  });

  it("omits customer email and text from a Calls-only Bot's new schema", async () => {
    expect(
      names(
        await buildRoleToolDefsForTenant("front_desk", selected, "user-pilot", "standard", flags),
      ),
    ).toEqual(["search_knowledge_base"]);
    expect(h.entitlements).toHaveBeenCalledWith("user-pilot");
  });

  it("filters stale cached send tools against the current paid channels", async () => {
    h.cached.mockResolvedValue(selected.map((name) => ({ name })));
    expect(
      names(
        await buildRoleToolDefsForTenant("front_desk", selected, "user-pilot", "standard", flags),
      ),
    ).toEqual(["search_knowledge_base"]);
    expect(h.connections).not.toHaveBeenCalled();
    expect(h.cacheWrite).not.toHaveBeenCalled();
  });

  it("preserves selected customer email for an eligible Email plan", async () => {
    h.entitlements.mockResolvedValue({ channels: ["email"] });
    expect(
      names(
        await buildRoleToolDefsForTenant("front_desk", selected, "user-pilot", "standard", flags),
      ),
    ).toEqual(["send_email", "search_knowledge_base"]);
  });

  it("applies paid SMS entitlement in addition to the existing messaging switch", async () => {
    h.entitlements.mockResolvedValue({ channels: ["sms"] });
    expect(
      names(
        await buildRoleToolDefsForTenant("front_desk", selected, "user-pilot", "standard", flags),
      ),
    ).toEqual(["send_text_message", "search_knowledge_base"]);
    expect(
      names(await buildRoleToolDefsForTenant("front_desk", selected, "user-pilot", "standard", {})),
    ).toEqual(["search_knowledge_base"]);
  });

  it("preserves other cached tools but denies customer sends when the entitlement read fails", async () => {
    h.cached.mockResolvedValue(selected.map((name) => ({ name })));
    h.entitlements.mockRejectedValue(new Error("Channel verification unavailable"));
    expect(
      names(
        await buildRoleToolDefsForTenant("front_desk", selected, "user-pilot", "standard", flags),
      ),
    ).toEqual(["search_knowledge_base"]);
    expect(h.cacheWrite).not.toHaveBeenCalled();
  });

  it("keeps unrelated execution available while a failed channel lookup denies sends", async () => {
    const ctx = context();
    h.entitlements.mockRejectedValue(new Error("Channel verification unavailable"));
    await expect(isAgentToolExecutionAuthorized("search_knowledge_base", ctx)).resolves.toBe(true);
    await expect(isAgentToolExecutionAuthorized("send_email", ctx)).resolves.toBe(false);
    expect(ctx.log.warn).toHaveBeenCalledWith(
      "Agent channel lookup failed; disabling customer send tools",
      { agentId: "agent-pilot", errorClass: "Error" },
    );
  });

  it("denies direct customer email execution for Calls-only even when selected", async () => {
    const ctx = context();
    await expect(isAgentToolExecutionAuthorized("send_email", ctx)).resolves.toBe(false);
    expect(h.entitlements).toHaveBeenCalledWith("user-pilot", ctx.drizzle);
  });

  it("rechecks channel authority on the next tool turn after a downgrade", async () => {
    const ctx = context();
    h.entitlements.mockResolvedValueOnce({ channels: ["email"] });
    await expect(isAgentToolExecutionAuthorized("send_email", ctx)).resolves.toBe(true);
    await expect(isAgentToolExecutionAuthorized("send_email", ctx)).resolves.toBe(false);
    expect(h.entitlements).toHaveBeenCalledTimes(2);
  });

  it("fails closed for customer sends when channel authority is absent", () => {
    expect(resolveAuthorizedAgentTools(selected, flags, NO_TENANT_INTEGRATIONS)).toEqual([
      "search_knowledge_base",
    ]);
  });

  it("exposes only the individually selected Computer action, even from a stale cache", async () => {
    const selectedComputer = ["check_computer_task"];
    const computerNames = [
      "start_computer_task",
      "check_computer_task",
      "reply_computer_task",
      "stop_computer_task",
    ];
    const fresh = names(
      await buildRoleToolDefsForTenant("front_desk", selectedComputer, "user-pilot", "standard", flags),
    );
    expect(fresh.filter((name) => computerNames.includes(name))).toEqual(selectedComputer);

    h.cached.mockResolvedValue(computerNames.map((name) => ({ name })));
    const cached = names(
      await buildRoleToolDefsForTenant("front_desk", selectedComputer, "user-pilot", "standard", flags),
    );
    expect(cached.filter((name) => computerNames.includes(name))).toEqual(selectedComputer);
  });

  it("rechecks Computer selection at execution and fails closed without verified context", async () => {
    let enabledTools: unknown = ["start_computer_task"];
    const query = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => [{ enabledTools }]),
    };
    const ctx = {
      ...context(),
      drizzle: { select: vi.fn(() => query) },
    } as unknown as ToolCallContext;

    await expect(isAgentToolExecutionAuthorized("start_computer_task", ctx)).resolves.toBe(true);
    await expect(isAgentToolExecutionAuthorized("reply_computer_task", ctx)).resolves.toBe(false);
    enabledTools = [];
    await expect(isAgentToolExecutionAuthorized("start_computer_task", ctx)).resolves.toBe(false);
    enabledTools = null;
    await expect(isAgentToolExecutionAuthorized("start_computer_task", ctx)).resolves.toBe(true);
    enabledTools = { start_computer_task: true };
    await expect(isAgentToolExecutionAuthorized("start_computer_task", ctx)).resolves.toBe(false);
    await expect(
      isAgentToolExecutionAuthorized("start_computer_task", {
        ...ctx,
        agent: { id: "agent-pilot", user_id: "" },
      }),
    ).resolves.toBe(false);
    await expect(
      isAgentToolExecutionAuthorized("start_computer_task", {
        ...ctx,
        drizzle: {} as ToolCallContext["drizzle"],
      }),
    ).resolves.toBe(false);
  });

  it("preserves the identity-checked manual follow-up without Email or entitlement lookup", async () => {
    h.entitlements.mockRejectedValue(new Error("unavailable"));
    await expect(isAgentToolExecutionAuthorized("create_followup_task", context())).resolves.toBe(
      true,
    );
    expect(h.entitlements).not.toHaveBeenCalled();
  });
});
