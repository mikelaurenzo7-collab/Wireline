import { beforeEach, describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({
  assertLiveExternalActionAllowed: vi.fn(),
}));

const providers = vi.hoisted(() => ({
  shopifyLookupOrder: vi.fn(),
  shopifySearchProducts: vi.fn(),
  shopifyLookupCustomer: vi.fn(),
  shopifyStartReturn: vi.fn(),
  shopifyCancelOrder: vi.fn(),
  shopifyUpdateAddress: vi.fn(),
  shopifyCreateDraftOrder: vi.fn(),
  shopifyAddOrderNote: vi.fn(),
  squareLookupOrder: vi.fn(),
  squareLookupCustomer: vi.fn(),
  squareCheckInventory: vi.fn(),
  squareCreatePaymentLink: vi.fn(),
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
vi.mock("../src/lib/shopify-service", () => ({
  lookupOrder: providers.shopifyLookupOrder,
  searchProducts: providers.shopifySearchProducts,
  lookupCustomer: providers.shopifyLookupCustomer,
  startReturn: providers.shopifyStartReturn,
  cancelOrder: providers.shopifyCancelOrder,
  updateOrderShippingAddress: providers.shopifyUpdateAddress,
  createDraftOrder: providers.shopifyCreateDraftOrder,
  addOrderNote: providers.shopifyAddOrderNote,
}));
vi.mock("../src/lib/square-service", () => ({
  squareLookupOrder: providers.squareLookupOrder,
  squareLookupCustomer: providers.squareLookupCustomer,
  squareCheckInventory: providers.squareCheckInventory,
  squareCreatePaymentLink: providers.squareCreatePaymentLink,
}));
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
import { handleShopifyToolCall } from "../src/lib/bot-tools/shopify";
import { handleSquareToolCall } from "../src/lib/bot-tools/square";
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

  it.each(["demo", "missing"])(
    "blocks Shopify, Square, X, and device providers for a %s tenant",
    async () => {
      const results = await Promise.all([
        handleShopifyToolCall("shopify_lookup_order", { order_number: "1001" }, context),
        handleSquareToolCall(
          "square_create_payment_link",
          { title: "Demo", amount_dollars: 5 },
          context,
        ),
        handleXToolCall("post_x_tweet", { text: "demo" }, context),
        handleDeviceToolCall("navigate_to", { destination: "Demo Street" }, context),
      ]);

      expect(
        [results[0], results[2], results[3]].every((result) => result?.result.includes("disabled")),
      ).toBe(true);
      expect(results[1]?.result).toContain("No payment link was created");
      expect(environment.assertLiveExternalActionAllowed).toHaveBeenCalledTimes(3);
      for (const provider of allProviderSpies()) expect(provider).not.toHaveBeenCalled();
    },
  );

  it("preserves honest local no-op tools without opening a provider path", async () => {
    await expect(
      handleShopifyToolCall(
        "shopify_apply_discount",
        { order_number: "1001", discount_code: "DEMO" },
        context,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ result: expect.stringContaining("can't apply a discount") }),
    );
    await expect(
      handleSquareToolCall(
        "square_send_invoice",
        { email: "buyer@example.com", amount: 10 },
        context,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ result: expect.stringContaining("cannot confirm") }),
    );

    expect(environment.assertLiveExternalActionAllowed).not.toHaveBeenCalled();
    for (const provider of allProviderSpies()) expect(provider).not.toHaveBeenCalled();
  });
});
