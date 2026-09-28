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
const flags = { twilioMessaging: true, twilioLookup: false };
const names = (tools: object[]) => tools.map((tool) => (tool as { name: string }).name);

function context() {
  const row = {
    id: "agent-pilot",
    enabledTools: selected,
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

  it("preserves the identity-checked manual follow-up without Email or entitlement lookup", async () => {
    h.entitlements.mockRejectedValue(new Error("unavailable"));
    await expect(isAgentToolExecutionAuthorized("create_followup_task", context())).resolves.toBe(
      true,
    );
    expect(h.entitlements).not.toHaveBeenCalled();
  });
});
