import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleXToolCall } from "./tool-handlers-x";

const mocks = vi.hoisted(() => ({
  postXTweet: vi.fn(),
  replyToXTweet: vi.fn(),
  likeXTweet: vi.fn(),
  repostXTweet: vi.fn(),
  sendXDirectMessage: vi.fn(),
  listXMentions: vi.fn(),
  listXAdCampaigns: vi.fn(),
  getXAdCampaignStats: vi.fn(),
}));

vi.mock("../../lib/x-service", () => ({
  postXTweet: mocks.postXTweet,
  replyToXTweet: mocks.replyToXTweet,
  likeXTweet: mocks.likeXTweet,
  repostXTweet: mocks.repostXTweet,
  sendXDirectMessage: mocks.sendXDirectMessage,
  listXMentions: mocks.listXMentions,
}));

vi.mock("../../lib/x-ads-service", () => ({
  listXAdCampaigns: mocks.listXAdCampaigns,
  getXAdCampaignStats: mocks.getXAdCampaignStats,
}));

const ctx = {
  toolCallId: "tc-1",
  payload: {},
  message: {},
  agent: { id: "agent-1", user_id: "user-1" },
  webhookAgentId: "agent-1",
  drizzle: {} as never,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
};

describe("handleXToolCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for unknown tools", async () => {
    const result = await handleXToolCall("unknown_tool", {}, ctx);
    expect(result).toBeNull();
  });

  it("post_x_tweet reports success when tweet id returned", async () => {
    mocks.postXTweet.mockResolvedValue("tweet-99");
    const result = await handleXToolCall("post_x_tweet", { text: "Hello" }, ctx);
    expect(result?.result).toMatch(/live on X/i);
    expect(mocks.postXTweet).toHaveBeenCalledWith("user-1", "Hello");
  });

  it("post_x_tweet reports missing connection when tweet id is null", async () => {
    mocks.postXTweet.mockResolvedValue(null);
    const result = await handleXToolCall("post_x_tweet", { text: "Hello" }, ctx);
    expect(result?.result).toMatch(/isn't connected/i);
  });

  it("list_x_mentions formats summary", async () => {
    mocks.listXMentions.mockResolvedValue([{ id: "1", text: "Hey @wireline" }]);
    const result = await handleXToolCall("list_x_mentions", { limit: 5 }, ctx);
    expect(result?.result).toContain("Recent X mentions");
    expect(result?.result).toContain("[1]");
  });

  it("list_x_ad_campaigns uses platform ads service", async () => {
    mocks.listXAdCampaigns.mockResolvedValue([
      { id: "c1", name: "Spring", entity_status: "ACTIVE" },
    ]);
    const result = await handleXToolCall("list_x_ad_campaigns", {}, ctx);
    expect(result?.result).toContain("Spring");
    expect(mocks.listXAdCampaigns).toHaveBeenCalled();
  });
});
