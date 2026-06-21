import type { AgentToolName } from "./agent-capabilities";
import type { DirectorIntegrationJob } from "./director-Assistants-plan";

/** Map Director integration job text into Vapi-style tool arguments. */
export function buildDirectorToolArgs(
  tool: AgentToolName,
  job: DirectorIntegrationJob,
): Record<string, unknown> {
  const text = (job.query || job.summary || "").trim();
  if (!text) return {};

  switch (tool) {
    case "shopify_lookup_order": {
      const orderMatch = text.match(/#?\d{3,10}/);
      const emailMatch = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
      return {
        order_number: orderMatch?.[0]?.replace(/^#/, "") ?? text,
        email: emailMatch?.[0],
      };
    }
    case "shopify_lookup_customer":
      return { email: text.includes("@") ? text : undefined, query: text };
    case "enrich_lead":
    case "lookup_phone_number":
      return { phone_number: text };
    case "send_slack_notification":
      return { message: text, urgency: "normal" };
    case "post_x_tweet":
      return { text };
    case "reply_to_x_tweet":
      return {
        text,
        tweet_id: text.match(/\d{10,25}/)?.[0],
      };
    case "like_x_tweet":
    case "repost_x_tweet":
      return { tweet_id: text.match(/\d{10,25}/)?.[0] || text };
    case "send_x_dm":
      return { recipient: text, text: job.summary || text };
    case "list_x_mentions":
      return { limit: 10 };
    case "get_x_ad_campaign_stats":
      return { campaign_id: text.match(/\d+/)?.[0] || text };
    case "send_teams_message":
      return { message: text };
    case "crm_log_call":
      return { subject: job.label, notes: text };
    case "crm_create_opportunity":
      return { deal_name: job.label, notes: text };
    case "crm_create_contact":
      return { notes: text, query: text };
    case "crm_update_deal_stage":
      return { stage: text, notes: job.summary };
    case "send_contract":
      return { context: text };
    case "book_appointment":
      return { datetime: text, notes: job.summary };
    case "check_calendar_availability":
      return { date: text };
    case "generate_zoom_link":
      return { topic: job.label, notes: text };
    case "meta_submit_lead":
      return { notes: text };
    default:
      return { query: text };
  }
}
