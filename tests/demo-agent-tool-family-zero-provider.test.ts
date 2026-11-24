import { beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({
  assertLiveExternalActionAllowed: vi.fn(),
}));

const providers = vi.hoisted(() => ({
  postXTweet: vi.fn(),
  replyToXTweet: vi.fn(),
  likeXTweet: vi.fn(),
  repostXTweet: vi.fn(),
  sendXDirectMessage: vi.fn(),
  listXMentions: vi.fn(),
  listXAdCampaigns: vi.fn(),
  getXAdCampaignStats: vi.fn(),
  notifyDeviceAction: vi.fn(),
}));

vi.mock("../src/lib/account-environment-policy", () => environment);
vi.mock("../src/lib/x-service", () => ({
  postXTweet: providers.postXTweet,
  replyToXTweet: providers.replyToXTweet,
  likeXTweet: providers.likeXTweet,
  repostXTweet: providers.repostXTweet,
  sendXDirectMessage: providers.sendXDirectMessage,
  listXMentions: providers.listXMentions,
}));
vi.mock("../src/lib/x-ads-service", () => ({
  listXAdCampaigns: providers.listXAdCampaigns,
  getXAdCampaignStats: providers.getXAdCampaignStats,
}));
vi.mock("../src/lib/mobile-push", () => ({
  notifyDeviceAction: providers.notifyDeviceAction,
}));

import { handleDeviceToolCall } from "../src/lib/bot-tools/device";
import { handleXToolCall } from "../src/lib/bot-tools/x";
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

describe("demo/test agent-tool provider families", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    environment.assertLiveExternalActionAllowed.mockRejectedValue(
      new Error("non-production workspace"),
    );
  });

  it.each(["demo", "missing"])("blocks X and device providers for a %s tenant", async () => {
    const results = await Promise.all([
      handleXToolCall("post_x_tweet", { text: "demo" }, context),
      handleDeviceToolCall("navigate_to", { destination: "Demo Street" }, context),
    ]);

    expect(results.every((result) => result?.result.includes("disabled"))).toBe(true);
    expect(environment.assertLiveExternalActionAllowed).toHaveBeenCalledTimes(2);
    for (const provider of allProviderSpies()) expect(provider).not.toHaveBeenCalled();
  });
});
