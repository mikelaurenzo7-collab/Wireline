import { beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({
  assertLiveExternalActionAllowed: vi.fn(),
}));

const providers = vi.hoisted(() => ({
  notifyDeviceAction: vi.fn(),
}));

vi.mock("../src/lib/account-environment-policy", () => environment);
vi.mock("../src/lib/mobile-push", () => ({
  notifyDeviceAction: providers.notifyDeviceAction,
}));

import { handleDeviceToolCall } from "../src/lib/bot-tools/device";
import type { ToolCallContext } from "../src/lib/agent-tool-types";

const context = {
  toolCallId: "tool-1",
  payload: {},
  message: {},
  agent: { id: "agent-1", user_id: "tenant-1" },
  webhookAgentId: "agent-1",
  drizzle: {},
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
} as unknown as ToolCallContext;

function allProviderSpies() {
  return Object.values(providers);
}

describe("demo tenants reach no provider in any tool family", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    environment.assertLiveExternalActionAllowed.mockRejectedValue(
      new Error("non-production workspace"),
    );
  });

  it.each(["demo", "missing"])("blocks device providers for a %s tenant", async () => {
    const result = await handleDeviceToolCall(
      "navigate_to",
      { destination: "Demo Street" },
      context,
    );

    expect(result?.result).toContain("disabled");
    expect(environment.assertLiveExternalActionAllowed).toHaveBeenCalledTimes(1);
    for (const provider of allProviderSpies()) expect(provider).not.toHaveBeenCalled();
  });
});
