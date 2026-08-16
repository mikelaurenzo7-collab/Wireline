/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi webhook/tool payloads are vendor-defined JSON envelopes. */
import {
  postXTweet,
  replyToXTweet,
  likeXTweet,
  repostXTweet,
  sendXDirectMessage,
  listXMentions,
} from "../../lib/x-service";
import { getXAdCampaignStats, listXAdCampaigns } from "../../lib/x-ads-service";
import type { ToolCallContext, ToolCallResult } from "./types";

function xUnavailable(toolCallId: string): ToolCallResult {
  return {
    toolCallId,
    result: "That action isn't available on this line right now. Help the caller another way.",
  };
}

export async function handleXToolCall(
  fn: string,
  args: any,
  context: ToolCallContext,
): Promise<ToolCallResult | null> {
  const { agent, toolCallId } = context;
  const userId = agent?.user_id;

  if (fn === "post_x_tweet") {
    if (!userId) return xUnavailable(toolCallId);
    const tweetId = await postXTweet(userId, String(args?.text || ""));
    return {
      toolCallId,
      result: tweetId
        ? "Done, the post is live on X."
        : "X isn't connected for this account yet, so I couldn't publish that.",
    };
  }

  if (fn === "reply_to_x_tweet") {
    if (!userId) return xUnavailable(toolCallId);
    const tweetId = await replyToXTweet(
      userId,
      String(args?.tweet_id || ""),
      String(args?.text || ""),
    );
    return {
      toolCallId,
      result: tweetId
        ? "Reply posted on X."
        : "Couldn't post that reply, check the X connection and tweet ID.",
    };
  }

  if (fn === "like_x_tweet") {
    if (!userId) return xUnavailable(toolCallId);
    const liked = await likeXTweet(userId, String(args?.tweet_id || ""));
    return {
      toolCallId,
      result: liked ? "Liked that post on X." : "Couldn't like that post on X right now.",
    };
  }

  if (fn === "repost_x_tweet") {
    if (!userId) return xUnavailable(toolCallId);
    const repostId = await repostXTweet(userId, String(args?.tweet_id || ""));
    return {
      toolCallId,
      result: repostId ? "Reposted on X." : "Couldn't repost that on X right now.",
    };
  }

  if (fn === "send_x_dm") {
    if (!userId) return xUnavailable(toolCallId);
    const sent = await sendXDirectMessage(
      userId,
      String(args?.recipient || args?.username || ""),
      String(args?.text || args?.message || ""),
    );
    return {
      toolCallId,
      result: sent
        ? "DM sent on X."
        : "Couldn't send that DM, check the recipient and X connection.",
    };
  }

  if (fn === "list_x_mentions") {
    if (!userId) return xUnavailable(toolCallId);
    const mentions = await listXMentions(userId, Number(args?.limit) || 10);
    if (!mentions.length) {
      return { toolCallId, result: "No recent mentions found on X." };
    }
    const summary = mentions.map((m) => `- [${m.id}] ${m.text.slice(0, 120)}`).join("\n");
    return { toolCallId, result: `Recent X mentions:\n${summary}` };
  }

  if (fn === "list_x_ad_campaigns") {
    const campaigns = await listXAdCampaigns();
    if (!campaigns.length) {
      return {
        toolCallId,
        result: "No X ad campaigns found, Ads API credentials may not be configured.",
      };
    }
    const summary = campaigns.map((c) => `- ${c.name} (${c.id}), ${c.entity_status}`).join("\n");
    return { toolCallId, result: `X ad campaigns:\n${summary}` };
  }

  if (fn === "get_x_ad_campaign_stats") {
    const stats = await getXAdCampaignStats(String(args?.campaign_id || ""));
    if (!stats) {
      return {
        toolCallId,
        result: "Couldn't load stats for that campaign, verify X Ads credentials and campaign ID.",
      };
    }
    return {
      toolCallId,
      result: `Campaign ${stats.campaign_id}: ${stats.impressions ?? 0} impressions, ${stats.clicks ?? 0} clicks.`,
    };
  }

  return null;
}
