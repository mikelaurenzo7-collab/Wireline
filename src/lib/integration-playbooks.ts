/**
 * Integration playbooks — how callers trigger agent work per connected system.
 * Single source for Assistants canvas, Integration Hub cards, and tool labels.
 */
import type { AgentToolCatalogEntry, AgentToolName, ToolIntegration } from "./agent-capabilities";
import { AGENT_TOOL_CATALOG } from "./agent-capabilities";

export interface IntegrationTask {
  id: string;
  /** What the customer says or the situation on the line */
  callerMoment: string;
  /** What the agent does in Wireline + the integration */
  agentAction: string;
  /** Tool ids that power this moment */
  tools: readonly AgentToolName[];
}

export interface IntegrationPlaybook {
  integration: ToolIntegration;
  label: string;
  headline: string;
  /** One line on the orbit / chip */
  orbitHint: string;
  connectPath: string;
  tasks: readonly IntegrationTask[];
}

const PLAYBOOKS: Record<ToolIntegration, IntegrationPlaybook> = {
  slack: {
    integration: "slack",
    label: "Slack",
    headline: "Hot leads and escalations hit your team channel in seconds.",
    orbitHint: "Notify #channel on events",
    connectPath: "/connections",
    tasks: [
      {
        id: "slack-hot",
        callerMoment: "Qualified lead, urgent issue, or compliance flag",
        agentAction: "Posts a structured alert to your default Slack channel with caller context.",
        tools: ["send_slack_notification"],
      },
    ],
  },
  x: {
    integration: "x",
    label: "X",
    headline: "Engage on X: post, reply, like, repost, and DM.",
    orbitHint: "Post, reply, like, DM",
    connectPath: "/connections",
    tasks: [
      {
        id: "x-post",
        callerMoment: "Account Holder or Director requests a public brand post",
        agentAction: "Publishes a tweet to the connected X account (max 280 characters).",
        tools: ["post_x_tweet"],
      },
      {
        id: "x-reply",
        callerMoment: "Someone commented or @mentioned the brand",
        agentAction: "Lists recent mentions, then replies or likes from the connected account.",
        tools: ["list_x_mentions", "reply_to_x_tweet", "like_x_tweet", "repost_x_tweet"],
      },
      {
        id: "x-dm",
        callerMoment: "Account Holder wants to DM a prospect or partner on X",
        agentAction: "Sends a direct message by @username or user ID.",
        tools: ["send_x_dm"],
      },
      {
        id: "x-ads",
        callerMoment: "Account Holder asks how paid campaigns are performing",
        agentAction: "Lists X Ads campaigns and pulls impressions/clicks/spend for a campaign ID.",
        tools: ["list_x_ad_campaigns", "get_x_ad_campaign_stats"],
      },
    ],
  },
  twilio: {
    integration: "twilio",
    label: "Messaging",
    headline: "SMS follow-ups while the conversation is still warm (WhatsApp in private beta).",
    orbitHint: "Text + number intelligence",
    connectPath: "/connections",
    tasks: [
      {
        id: "sms-followup",
        callerMoment: '"Text me the link" / appointment confirmation',
        agentAction:
          "Sends an SMS with the agreed details (with consent). WhatsApp is available in private beta when enabled.",
        tools: ["send_text_message"],
      },
      {
        id: "sms-validate",
        callerMoment: "New or suspicious number on the line",
        agentAction: "Validates line type and carrier before scheduling callbacks or SMS.",
        tools: ["lookup_phone_number"],
      },
    ],
  },
  zoom: {
    integration: "zoom",
    label: "Zoom",
    headline: "Demo and discovery calls get a join link without back-and-forth email.",
    orbitHint: "Meeting links on bookings",
    connectPath: "/connections",
    tasks: [
      {
        id: "zoom-book",
        callerMoment: '"Book a video call" / remote appointment',
        agentAction: "Creates a Zoom meeting and attaches the join URL to the calendar event.",
        tools: ["generate_zoom_link", "book_appointment"],
      },
    ],
  },
  calendar: {
    integration: "calendar",
    label: "Calendar",
    headline: "Real availability. No double-books, no 'let me check and call back'.",
    orbitHint: "Check slots · book live",
    connectPath: "/calendar?tab=availability",
    tasks: [
      {
        id: "cal-check",
        callerMoment: '"What times work this week?"',
        agentAction:
          "Checks your Calendar hours and existing bookings, or a connected Google or Microsoft calendar.",
        tools: ["check_calendar_availability"],
      },
      {
        id: "cal-book",
        callerMoment: '"Book me for Tuesday at 2"',
        agentAction:
          "Books an available time or requests approval, following your Calendar rules and confirmed timezone.",
        tools: ["book_appointment"],
      },
    ],
  },
  docusign: {
    integration: "docusign",
    label: "DocuSign",
    headline: "Close on the call. Contract hits their inbox before they hang up.",
    orbitHint: "E-sign on verbal yes",
    connectPath: "/connections",
    tasks: [
      {
        id: "ds-send",
        callerMoment: '"Send me the agreement" / verbal commit to sign',
        agentAction: "Dispatches the DocuSign envelope to the email on the call.",
        tools: ["send_contract"],
      },
    ],
  },
  microsoft_teams: {
    integration: "microsoft_teams",
    label: "Microsoft Teams",
    headline: "Microsoft shops get Teams alerts instead of another inbox.",
    orbitHint: "Post to Teams channel",
    connectPath: "/connections",
    tasks: [
      {
        id: "teams-notify",
        callerMoment: "Escalation, booked meeting, or high-value lead",
        agentAction: "Posts to your configured Teams team and channel.",
        tools: ["send_teams_message"],
      },
    ],
  },
  microsoft_excel: {
    integration: "microsoft_excel",
    label: "Excel",
    headline: "Every call becomes a row in your BotBound log workbook, no manual export.",
    orbitHint: "Append call log row",
    connectPath: "/connections",
    tasks: [
      {
        id: "excel-log",
        callerMoment: "Call completed (any outcome)",
        agentAction: "Appends caller, outcome, and notes to your OneDrive spreadsheet.",
        tools: ["log_to_excel"],
      },
    ],
  },
  google_sheets: {
    integration: "google_sheets",
    label: "Google Sheets",
    headline: "Every call becomes a row in your Google Sheets call log workbook, no manual export.",
    orbitHint: "Append call log row",
    connectPath: "/connections",
    tasks: [
      {
        id: "sheets-log",
        callerMoment: "Call completed (any outcome)",
        agentAction: "Appends caller, outcome, and notes to your Google Drive spreadsheet.",
        tools: ["log_to_google_sheets"],
      },
    ],
  },
};

export function getIntegrationPlaybook(
  integration: ToolIntegration,
): IntegrationPlaybook | undefined {
  return PLAYBOOKS[integration];
}

export function getAllIntegrationPlaybooks(): IntegrationPlaybook[] {
  return Object.values(PLAYBOOKS);
}

const catalogByName = new Map(AGENT_TOOL_CATALOG.map((t) => [t.name, t]));

export function getCatalogEntry(name: AgentToolName): AgentToolCatalogEntry | undefined {
  return catalogByName.get(name);
}

const PROVIDER_TOOL_INTEGRATION: Partial<
  Record<
    "slack" | "x" | "zoom" | "microsoft_teams" | "microsoft_excel" | "google_sheets",
    ToolIntegration
  >
> = {
  slack: "slack",
  x: "x",
  zoom: "zoom",
  microsoft_teams: "microsoft_teams",
  microsoft_excel: "microsoft_excel",
  google_sheets: "google_sheets",
};

export function toolIntegrationForProvider(
  provider: keyof typeof PROVIDER_TOOL_INTEGRATION,
): ToolIntegration | undefined {
  return PROVIDER_TOOL_INTEGRATION[provider];
}

export const PROVIDER_ACCENT: Record<string, string> = {
  slack: "#4A154B",
  x: "#000000",
  zoom: "#2D8CFF",
  microsoft_teams: "#6264A7",
  microsoft_excel: "#217346",
  google_sheets: "#0F9D58", // Google green
};

export function validatePlaybookCoverage(): string[] {
  const covered = new Set<AgentToolName>();
  for (const pb of Object.values(PLAYBOOKS)) {
    for (const task of pb.tasks) {
      for (const t of task.tools) covered.add(t);
    }
  }
  const gaps: string[] = [];
  for (const entry of AGENT_TOOL_CATALOG) {
    if (entry.integration && !covered.has(entry.name)) {
      gaps.push(entry.name);
    }
  }
  return gaps;
}
