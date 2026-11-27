import {
  ALWAYS_ON_AGENT_TOOL_NAMES,
  applyPlanToolUnlocks,
  resolveAgentTools,
} from "./agent-capabilities";
import {
  filterToolsByTenantConnections,
  loadTenantIntegrationConnections,
} from "./tenant-integration-connections";
import { getTenantChannelEntitlements } from "./channel-entitlements";
import { isAgentToolChannelAllowed } from "./agent-tool-channel-policy";
import { log } from "./server-context";
import { UNVERIFIED_LIVE_TOOL_NAMES } from "./unverified-live-tools";

export function sanitizePhone(phone: string | undefined | null): string {
  return (phone || "").replace(/[^0-9+]/g, "").slice(0, 20);
}

/** Bound the assembled live-agent prompt to protect latency and runtime cost. */
export const MAX_RUNTIME_PROMPT_CHARS = 18_000;

export function clampRuntimePrompt(text: string, max = MAX_RUNTIME_PROMPT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[Context trimmed for voice latency, use tools for account-specific detail.]`;
}

/**
 * Runtime guardrail section headers, in the order they appear in a composed
 * prompt: COMPLIANCE first, VOICE AND DELIVERY CONSISTENCY always last. Each
 * string MUST be a prefix of the real header — a marker that never matches its
 * section silently forfeits that guardrail's protection during a clamp.
 *
 * The COMPLIANCE, DO-NOT-DISCUSS and IMMEDIATE-ESCALATION headers were written
 * by buildAgentRuntimeContext. Nothing in production called it, so it has been
 * removed; the markers stay so a prompt that carries those headers is clamped
 * the same way.
 */
const RUNTIME_GUARDRAIL_MARKERS = [
  "\n\n## COMPLIANCE",
  "\n\n## DO-NOT-DISCUSS TOPICS",
  "\n\n## IMMEDIATE-ESCALATION TRIGGERS",
  // OWNER_LIMITS_HEADING in agent-playbook.ts: what the owner ruled out.
  "\n\n## LIMITS SET BY THE ACCOUNT HOLDER",
  "\n\n## ACTION AND RESULT SAFETY",
  "\n\n## VOICE AND DELIVERY CONSISTENCY",
] as const;

/** OWNER_LIMITS_HEADING in agent-playbook.ts, as it appears between blocks. */
const OWNER_LIMITS_MARKER = "\n\n## LIMITS SET BY THE ACCOUNT HOLDER";
/**
 * What the opening of a call prompt needs before the owner's own content:
 * identity and the fixed call rules, the time, the hours and the calendar
 * rules come to about 4,000 characters.
 */
const MIN_HEAD_BESIDE_OWNER_LIMITS = 6_000;
const MIN_OWNER_LIMITS_WORTH_KEEPING = 300;

const RUNTIME_TRIM_NOTICE =
  "\n\n[Context trimmed for voice latency, use tools for account-specific detail.]";
/** How far back a cut looks for the end of a line: a little over one rule or fact. */
const RUNTIME_TRIM_LINE_REACH = 800;

/** Whether an assembled prompt was cut to fit, so the runtime can say so in its log. */
export function wasRuntimePromptTrimmed(prompt: string): boolean {
  return prompt.includes(RUNTIME_TRIM_NOTICE);
}

/**
 * Clamp an assembled runtime prompt without dropping the compliance /
 * do-not-discuss / escalation / voice-consistency guardrails appended at the
 * tail.
 *
 * The guardrail block runs from the EARLIEST guardrail marker to the end of
 * the prompt, so preservation must slice from that earliest marker and
 * truncate the head (base prompt + knowledge + directives) instead. Preserving
 * from a later marker keeps only that section and silently discards every
 * guardrail before it — which is exactly how HIPAA/TCPA conduct rules and
 * escalation triggers used to vanish on long prompts. If even the guardrail
 * block alone cannot fit (pathological — the per-item caps bound it to a few
 * kB), fall back through later markers and finally to a plain head clamp.
 */
export function clampRuntimePromptPreservingTail(
  text: string,
  max = MAX_RUNTIME_PROMPT_CHARS,
): string {
  if (text.length <= max) return text;

  // Runtime guardrails are appended after every tenant-authored prompt block.
  // Select the final occurrence of each marker so a saved prompt cannot place
  // an earlier lookalike heading and trick the overflow clamp into preserving
  // tenant text while dropping the real runtime policy.
  const indices = RUNTIME_GUARDRAIL_MARKERS.map((marker) => text.lastIndexOf(marker))
    .filter((idx) => idx > 0)
    .sort((a, b) => a - b);

  for (const [position, idx] of indices.entries()) {
    let tail = text.slice(idx);
    // The owner's limits are kept with the fixed text after them, but not at
    // the cost of the fixed text before them. The opening of a call prompt
    // (who the Bot is, the call rules, the time, the hours, the calendar
    // rules) is platform text too, and an owner with long lists could squeeze
    // it out. Past what the opening needs, the owner's block gives way
    // instead, from its own end, by whole lines.
    const afterOwnerLimits = indices[position + 1];
    if (text.startsWith(OWNER_LIMITS_MARKER, idx) && afterOwnerLimits !== undefined) {
      const fixedTail = text.slice(afterOwnerLimits);
      const ownerLimits = text.slice(idx, afterOwnerLimits);
      const room =
        max -
        RUNTIME_TRIM_NOTICE.length -
        fixedTail.length -
        // Never more than a third of the whole: a smaller limit scales it down.
        Math.min(idx, MIN_HEAD_BESIDE_OWNER_LIMITS, Math.floor(max / 3));
      if (ownerLimits.length > room) {
        if (room < MIN_OWNER_LIMITS_WORTH_KEEPING) continue;
        const fits = ownerLimits.slice(0, room);
        const lastLine = fits.lastIndexOf("\n");
        let shortened = lastLine > 0 ? fits.slice(0, lastLine) : fits;
        // A list heading with none of its items left says nothing.
        const headingStart = shortened.lastIndexOf("\n");
        if (shortened.endsWith(":") && headingStart > 0) {
          shortened = shortened.slice(0, headingStart);
        }
        tail = `${shortened}${fixedTail}`;
      }
    }
    const headBudget = Math.min(idx, max - tail.length - RUNTIME_TRIM_NOTICE.length);
    if (headBudget < 500) continue;
    // Whole lines where a line ends close by. Rules and facts are one line
    // each, at most 700 characters, so the cut drops complete items from the
    // end instead of leaving half a sentence for the Bot to guess at. A longer
    // unbroken passage is still cut where the budget ends, not thrown away.
    const head = text.slice(0, headBudget);
    const lineEnd = head.lastIndexOf("\n");
    const kept = lineEnd >= headBudget - RUNTIME_TRIM_LINE_REACH ? head.slice(0, lineEnd) : head;
    return `${kept}${RUNTIME_TRIM_NOTICE}${tail}`;
  }

  return clampRuntimePrompt(text, max);
}

export const AGENT_TOOL_DEFS = {
  search_knowledge_base: {
    name: "search_knowledge_base",
    description:
      "Searches approved knowledge base entries, business rules, and policy content for this agent. " +
      "Use this when a caller asks about pricing, services, operating hours, company policies, procedures, or any " +
      "specific information you are not completely sure about. Always prefer this over guessing.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Precise question about a product, service, policy, procedure, pricing, " +
            "or any business detail the caller is asking about.",
        },
      },
      required: ["query"],
    },
  },
  view_recent_interactions: {
    name: "view_recent_interactions",
    description:
      "Private interaction history requires stronger caller verification. This live tool shares no history; offer a team follow-up.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  escalate_to_human: {
    name: "escalate_to_human",
    description:
      "Transfers the call to a human agent. Use if the caller is very upset, asks for a real person more than once, the issue is beyond your authority, or legal/liability language is used.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description:
            "Brief reason for the escalation (e.g. 'Caller requested a supervisor', 'Legal threat, needs manager', 'Complex billing dispute beyond agent authority'). Used to brief the human agent taking the call.",
        },
      },
      required: ["reason"],
    },
  },
  create_followup_task: {
    name: "create_followup_task",
    description:
      "Creates a follow-up task for a human team member. Use for complex issues you cannot resolve on the call.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Detailed description of what needs to be done.",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Urgency level.",
        },
      },
      required: ["description", "priority"],
    },
  },
  send_email: {
    name: "send_email",
    description:
      "Send the email the caller requested once their address is confirmed. Invoke this tool instead of reading the email aloud or asking permission to send it again. Wait for its result before confirming that it was sent.",
    parameters: {
      type: "object",
      properties: {
        to_email: { type: "string", description: "Customer's email address." },
        email_confirmed: {
          type: "boolean",
          description: "True only after reading back the exact address and the caller confirms it.",
        },
        subject: { type: "string", description: "Email subject line." },
        body: {
          type: "string",
          description:
            "Requested email content as plain text with relevant verified https URLs. The service adds the Bot's business signature; omit a second signature and internal notes.",
        },
      },
      required: ["to_email", "email_confirmed", "subject", "body"],
    },
  },
  send_text_message: {
    name: "send_text_message",
    description:
      // "SMS" → "text message" because OpenAI TTS reads "SMS" letter-by-letter
      // (S-M-S) which sounds choppy on the call. "text message" reads
      // naturally and is the term real callers use anyway.
      "Sends a text message or WhatsApp follow-up. Only use this when the customer explicitly asked for a text or has already consented to that channel. Good for links, confirmations, appointment details, or next steps.",
    parameters: {
      type: "object",
      properties: {
        to_number: {
          type: "string",
          description: "Destination phone number. Leave blank to use the current caller's number.",
        },
        channel: {
          type: "string",
          enum: ["sms", "whatsapp"],
          description: "Which Twilio messaging channel to use.",
        },
        message_body: {
          type: "string",
          description: "Plain-text message content to send.",
        },
      },
      required: ["channel", "message_body"],
    },
  },
  lookup_phone_number: {
    name: "lookup_phone_number",
    description:
      "Runs phone-number intelligence before messaging or updating records. Use it to validate a number and learn if it is mobile, landline, or VoIP.",
    parameters: {
      type: "object",
      properties: {
        phone_number: {
          type: "string",
          description:
            "Phone number to validate. Leave blank to inspect the current caller's number.",
        },
      },
      required: [],
    },
  },
  add_to_dnc: {
    name: "add_to_dnc",
    description:
      "Adds a phone number to the Do Not Call list immediately. Use this whenever the caller opts out of future calls or messages.",
    parameters: {
      type: "object",
      properties: {
        phone_number: {
          type: "string",
          description: "Phone number to suppress. Leave blank to use the current caller's number.",
        },
        reason: {
          type: "string",
          description:
            "Brief reason for the suppression, like 'caller opt-out' or 'requested no more texts'.",
        },
      },
      required: [],
    },
  },
  check_calendar_availability: {
    name: "check_calendar_availability",
    description:
      "Checks the workspace Calendar or a connected calendar. ALWAYS run this before offering an appointment. Use only returned available slots and their stated timezone; never reveal other customers' appointment details.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description:
            "Exact local calendar date in YYYY-MM-DD format. For a configured native Calendar, resolve relative dates from its Calendar-local today, not the Bot's date.",
        },
        timezone: {
          type: "string",
          description:
            "IANA timezone for that local date, such as America/Chicago. Prefer the saved native Calendar timezone when configured. Otherwise use the Bot's configured timezone unless the caller confirms a different one.",
        },
      },
      required: ["date", "timezone"],
    },
  },
  book_appointment: {
    name: "book_appointment",
    description:
      "Books an appointment after checking availability and the caller confirms the date and time. Use the availability timezone for the booking. Clarify it with the caller only when asked or when the time is ambiguous. Follow the returned status: Scheduled is booked; Requested is awaiting the owner's chosen approval. Do not invent an owner-confirmation requirement for automatic booking.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Exact local appointment date in YYYY-MM-DD format.",
        },
        time: {
          type: "string",
          pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$",
          description: "Exact local appointment time in 24-hour HH:mm format.",
        },
        timezone: {
          type: "string",
          description:
            "IANA timezone for the appointment, such as America/Chicago. Use the timezone returned by availability; a configured native Calendar's saved timezone is authoritative. If availability supplies no timezone, use the timezone agreed with the caller or the Bot's configured timezone.",
        },
        customer_name: { type: "string", description: "Caller's full name." },
        service_type: {
          type: "string",
          description: "Type of service (e.g., 'HVAC Repair', 'Plumbing Inspection').",
        },
      },
      required: ["date", "time", "timezone", "customer_name", "service_type"],
    },
  },
  search_leads: {
    name: "search_leads",
    description:
      "Private lead records require stronger caller verification. This live tool shares no lead details; offer a team follow-up.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  update_lead_status: {
    name: "update_lead_status",
    description:
      "Existing lead status changes require team verification. This live tool makes no record change; offer a follow-up task.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: [
            "qualified",
            "not_interested",
            "callback_requested",
            "proposal_sent",
            "closed_won",
            "closed_lost",
          ],
          description: "The outcome of this interaction.",
        },
        notes: { type: "string", description: "One sentence summarising why this status was set." },
      },
      required: ["status", "notes"],
    },
  },
  log_payment_promise: {
    name: "log_payment_promise",
    description:
      "Records a payment promise made by the customer during a collections call. REQUIRED whenever a payment commitment is made, FDCPA compliance.",
    parameters: {
      type: "object",
      properties: {
        amount_promised: {
          type: "string",
          description: "The dollar amount the customer agreed to pay (e.g., '$250').",
        },
        payment_date: {
          type: "string",
          description: "The date they committed to pay (e.g., 'Friday June 7th').",
        },
        payment_method: {
          type: "string",
          description:
            "How they will pay (e.g., 'credit card over phone', 'check by mail', 'online portal').",
        },
      },
      required: ["amount_promised", "payment_date"],
    },
  },
  create_support_ticket: {
    name: "create_support_ticket",
    description:
      "Creates a formal support ticket for issues requiring engineering or specialist review. Use when you cannot resolve the issue on the call.",
    parameters: {
      type: "object",
      properties: {
        issue_summary: {
          type: "string",
          description: "Concise description of the technical problem.",
        },
        error_codes: {
          type: "string",
          description: "Any error codes or messages the customer reported (leave blank if none).",
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Impact severity of this issue.",
        },
      },
      required: ["issue_summary", "severity"],
    },
  },
  leave_voicemail: {
    name: "leave_voicemail",
    description:
      "Call this tool IMMEDIATELY when you detect you have reached an answering machine or voicemail. After calling it, deliver a concise 15-20 second voicemail and then say goodbye to end the call.",
    parameters: {
      type: "object",
      properties: {
        voicemail_message: {
          type: "string",
          description:
            "The exact text of the voicemail you are about to leave (15-20 seconds when spoken).",
        },
      },
      required: ["voicemail_message"],
    },
  },
  schedule_callback: {
    name: "schedule_callback",
    description:
      "Automatic callbacks require a verified destination and team review. This live tool does not schedule a callback; offer a follow-up task.",
    parameters: {
      type: "object",
      properties: {
        callback_datetime: {
          type: "string",
          description:
            "ISO 8601 datetime for the callback in the contact's local timezone (e.g. '2026-05-07T14:00:00-05:00'). Calculate this from what the caller says, 'Tuesday at 2pm', 'tomorrow morning at 10', 'next Monday afternoon'. Today is injected into your system prompt so you can calculate the correct date.",
        },
        notes: {
          type: "string",
          description:
            "Context to include when calling back, what you were discussing, what to follow up on.",
        },
      },
      required: ["callback_datetime", "notes"],
    },
  },
  capture_customer_profile: {
    name: "capture_customer_profile",
    description:
      "Saves structured notes about the customer gathered during this call. Call this any time you learn something meaningful, budget range, timeline, key pain points, objections, decision-maker status, or interests. This enriches the customer's profile so the next agent has full context and doesn't repeat questions.",
    parameters: {
      type: "object",
      properties: {
        pain_points: {
          type: "string",
          description:
            "The customer's main challenges or frustrations as they expressed them, in their own words or a close paraphrase.",
        },
        budget_range: {
          type: "string",
          description:
            "Any budget or price range mentioned (e.g., '$5,000 to $10,000/year', 'Under $500/month'). Leave blank if not discussed.",
        },
        timeline: {
          type: "string",
          description:
            "Urgency or timeline they mentioned (e.g., 'Needs solution by Q3', 'Just researching for now'). Leave blank if not discussed.",
        },
        decision_authority: {
          type: "string",
          enum: ["decision_maker", "influencer", "gatekeeper", "unknown"],
          description: "Whether this person can sign off on a purchase or must involve others.",
        },
        objections: {
          type: "string",
          description:
            "Any hesitations, objections, or concerns raised (e.g., 'Worried about switching costs', 'Already evaluating Competitor X'). Leave blank if none.",
        },
        interests: {
          type: "string",
          description: "Features, outcomes, or topics they expressed genuine interest in.",
        },
        next_step_agreed: {
          type: "string",
          description:
            "Any concrete next step both parties agreed on (e.g., 'Demo on Friday', 'Will send proposal by EOD'). Leave blank if none.",
        },
      },
      required: ["pain_points", "decision_authority"],
    },
  },
  send_slack_notification: {
    name: "send_slack_notification",
    description:
      "Notify the team via Slack about an important call outcome, hot lead, booked meeting, escalation, or deal milestone. Only use when something noteworthy happened that the team should see immediately.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "A concise notification message for the team Slack channel.",
        },
        outcome: {
          type: "string",
          description: "Optional short outcome label (escalated, booked, refund, etc.).",
        },
        urgency: {
          type: "string",
          enum: ["normal", "high"],
          description: "Use high for escalations or revenue-critical moments.",
        },
      },
      required: ["message"],
    },
  },
  post_x_tweet: {
    name: "post_x_tweet",
    description:
      "Publish a tweet to the Account Holder's connected X account. Use only when explicitly asked to post on X/Twitter or share a public brand update.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Tweet body (max 280 characters).",
        },
      },
      required: ["text"],
    },
  },
  reply_to_x_tweet: {
    name: "reply_to_x_tweet",
    description:
      "Reply publicly to a tweet on X. Use when asked to respond to a comment, mention, or thread.",
    parameters: {
      type: "object",
      properties: {
        tweet_id: { type: "string", description: "The tweet ID to reply to." },
        text: { type: "string", description: "Reply text (max 280 characters)." },
      },
      required: ["tweet_id", "text"],
    },
  },
  like_x_tweet: {
    name: "like_x_tweet",
    description: "Like a tweet on X by tweet ID.",
    parameters: {
      type: "object",
      properties: {
        tweet_id: { type: "string", description: "The tweet ID to like." },
      },
      required: ["tweet_id"],
    },
  },
  repost_x_tweet: {
    name: "repost_x_tweet",
    description: "Repost (retweet) a tweet on X by tweet ID.",
    parameters: {
      type: "object",
      properties: {
        tweet_id: { type: "string", description: "The tweet ID to repost." },
      },
      required: ["tweet_id"],
    },
  },
  send_x_dm: {
    name: "send_x_dm",
    description:
      "Send a direct message on X. Recipient can be a numeric user ID or @username. Only when explicitly requested.",
    parameters: {
      type: "object",
      properties: {
        recipient: {
          type: "string",
          description: "X user ID or @username for the DM recipient.",
        },
        text: { type: "string", description: "DM message body." },
      },
      required: ["recipient", "text"],
    },
  },
  list_x_mentions: {
    name: "list_x_mentions",
    description:
      "List recent @mentions for the connected X account, useful before replying to comments.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "How many mentions to return (1 to 25, default 10).",
        },
      },
    },
  },
  list_x_ad_campaigns: {
    name: "list_x_ad_campaigns",
    description:
      "List X Ads campaigns for the BotBound ads account. Requires platform Ads API credentials.",
    parameters: { type: "object", properties: {} },
  },
  get_x_ad_campaign_stats: {
    name: "get_x_ad_campaign_stats",
    description: "Get impressions, clicks, and spend for a specific X Ads campaign ID.",
    parameters: {
      type: "object",
      properties: {
        campaign_id: { type: "string", description: "X Ads campaign ID." },
      },
      required: ["campaign_id"],
    },
  },
  generate_zoom_link: {
    name: "generate_zoom_link",
    description:
      "Generate a Zoom meeting link for a scheduled appointment. Typically used alongside book_appointment when the Account Holder has Zoom connected.",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Meeting topic/title." },
        start_time: { type: "string", description: "ISO 8601 start time for the meeting." },
        duration: { type: "number", description: "Duration in minutes. Defaults to 60." },
      },
      required: ["topic", "start_time"],
    },
  },
  send_contract: {
    name: "send_contract",
    description:
      "Sends a DocuSign contract to the customer. Use this when the customer is ready to sign. Confirm their email address and name before sending.",
    parameters: {
      type: "object",
      properties: {
        recipient_name: { type: "string", description: "Customer's full name" },
        recipient_email: { type: "string", description: "Customer's email address" },
        template_id: {
          type: "string",
          description: "The template ID to use (if known) or leave blank for default.",
        },
      },
      required: ["recipient_name", "recipient_email"],
    },
  },
  gemini_ground: {
    name: "gemini_ground",
    description:
      "Looks up fresh public information via live web research (Perplexity when configured, otherwise built-in web search). Use ONLY when the caller asks something that isn't in your knowledge base AND requires current public info, competitor pricing, news headlines, today's weather, business hours, regulatory updates. Returns a concise answer with citations. Do NOT use for internal customer data; offer a team follow-up when private account details are needed. Never use it to find facts about this business itself, such as its services, prices or hours; those come only from Knowledge.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query. Phrase as a self-contained question, e.g. 'current AWS S3 standard storage pricing per GB' or 'restaurant Chicago Lou Malnati closing time Thursday'.",
        },
      },
      required: ["query"],
    },
  },
  send_teams_message: {
    name: "send_teams_message",
    description:
      "Notify the team via Microsoft Teams about an important call outcome, hot lead, booked meeting, escalation, or deal milestone. Only use when something noteworthy happened that the team should see immediately.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "A concise notification message for the team's Microsoft Teams channel.",
        },
        outcome: {
          type: "string",
          description: "Optional short outcome label (escalated, booked, refund, etc.).",
        },
      },
      required: ["message"],
    },
  },
  log_to_excel: {
    name: "log_to_excel",
    description:
      "Append a row to the Account Holder's BotBound Call Log spreadsheet in OneDrive, recording the caller, outcome, and a short detail. Use it at the end of a call to keep a running log the Account Holder can review in Excel.",
    parameters: {
      type: "object",
      properties: {
        caller: {
          type: "string",
          description: "The caller's name, or their phone number if no name was given.",
        },
        outcome: {
          type: "string",
          description:
            "Short outcome label, e.g. 'Booked', 'Qualified lead', 'No answer', 'Escalated'.",
        },
        details: {
          type: "string",
          description: "One or two sentences summarizing what happened on the call.",
        },
      },
      required: ["caller", "outcome", "details"],
    },
  },
  log_to_google_sheets: {
    name: "log_to_google_sheets",
    description:
      "Append a row to the Account Holder's BotBound Call Log spreadsheet in Google Drive, recording the caller, outcome, and a short detail. Use it at the end of a call to keep a running log the Account Holder can review in Google Sheets.",
    parameters: {
      type: "object",
      properties: {
        caller: {
          type: "string",
          description: "The caller's name, or their phone number if no name was given.",
        },
        outcome: {
          type: "string",
          description:
            "Short outcome label, e.g. 'Booked', 'Qualified lead', 'No answer', 'Escalated'.",
        },
        details: {
          type: "string",
          description: "One or two sentences summarizing what happened on the call.",
        },
      },
      required: ["caller", "outcome", "details"],
    },
  },
  navigate_to: {
    name: "navigate_to",
    description:
      "Send turn-by-turn directions to a destination to the Account Holder's phone. Use when the Account Holder asks you to navigate somewhere (e.g. 'take me to the airport').",
    parameters: {
      type: "object",
      properties: {
        destination: {
          type: "string",
          description: "The place or address to navigate to (e.g. 'SFO airport', '123 Main St').",
        },
      },
      required: ["destination"],
    },
  },
  add_reminder: {
    name: "add_reminder",
    description:
      "Create a calendar reminder on the Account Holder's phone. Use when the Account Holder asks to be reminded of something.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What to be reminded about." },
        datetime: {
          type: "string",
          description: "When, as an ISO 8601 timestamp if known (e.g. 2026-06-14T09:00:00).",
        },
      },
      required: ["title"],
    },
  },
  play_music: {
    name: "play_music",
    description:
      "Open music playback for a song, artist, or playlist on the Account Holder's phone. Use when the Account Holder asks to play music.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Song, artist, or playlist to play." },
      },
      required: ["query"],
    },
  },
  start_computer_task: {
    name: "start_computer_task",
    description:
      "Starts an asynchronous supervised Cloud Computer browser task for the current Bot and immediately returns the task_id and status so you can acknowledge to the caller without dead air.",
    parameters: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description:
            "Clear sentence or two describing the browser task for the Cloud Computer to perform.",
        },
        start_url: {
          type: "string",
          description:
            "Optional full starting URL (https://...) to open first before performing the goal.",
        },
      },
      required: ["goal"],
    },
  },
  check_computer_task: {
    name: "check_computer_task",
    description:
      "Checks the current status, summary, or pending question of a running or recent Cloud Computer browser task so you can report the live result to the caller.",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description:
            "Optional task_id returned on this call. Defaults to the latest task started on this call.",
        },
      },
    },
  },
  reply_computer_task: {
    name: "reply_computer_task",
    description:
      "Sends the caller's or owner's answer to a paused Cloud Computer browser task (status=needs_input) so the browser can resume work.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "The exact answer or instruction from the caller to resume the paused browser task.",
        },
        task_id: {
          type: "string",
          description:
            "Optional task_id returned on this call. Defaults to the latest task started on this call.",
        },
      },
      required: ["message"],
    },
  },
  stop_computer_task: {
    name: "stop_computer_task",
    description:
      "Stops a running or paused Cloud Computer browser task when the caller cancels or changes their request.",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description:
            "Optional task_id returned on this call. Defaults to the latest task started on this call.",
        },
      },
    },
  },
} as const;

export type AgentToolName = keyof typeof AGENT_TOOL_DEFS;

export function buildAgentToolDefs(enabledTools?: unknown): object[] {
  const toolNames = resolveAgentTools(enabledTools) as AgentToolName[];
  const tools = toolNames
    .filter((name) => !UNVERIFIED_LIVE_TOOL_NAMES.has(name))
    .map((name) => AGENT_TOOL_DEFS[name])
    .filter(Boolean);
  return withAlwaysOnTools(tools, () => true);
}

/**
 * Adds what every Bot can do, whatever was ticked: look up what it was taught,
 * leave the owner a message, and honour a do-not-call request. The execution
 * check allows the same three. A saved selection that left one out used to be
 * masked: one retired name in the list switched the whole catalogue on here.
 */
function withAlwaysOnTools(tools: object[], channelAllows: (name: string) => boolean) {
  const offered = new Set(tools.map((tool) => String((tool as { name?: unknown }).name || "")));
  for (const name of ALWAYS_ON_AGENT_TOOL_NAMES) {
    if (offered.has(name) || UNVERIFIED_LIVE_TOOL_NAMES.has(name) || !channelAllows(name)) continue;
    const definition = AGENT_TOOL_DEFS[name];
    if (definition) tools.push(definition);
  }
  return tools;
}

/** Live tools respect the selected set, available connections and current paid channels. */
export async function buildAgentToolDefsForTenant(
  enabledTools: unknown,
  userId: string,
  aiTier?: string | null,
  tenantFlags?: { twilioMessaging?: boolean; twilioLookup?: boolean },
): Promise<object[]> {
  const { getCachedTenantToolDefs, setCachedTenantToolDefs } = await import("./tenant-tools-cache");

  // Connection schemas may be cached, but paid channel authority must be fresh.
  // A downgrade must not keep advertising customer sends from an older cache.
  const [cached, entitlements] = await Promise.all([
    getCachedTenantToolDefs(userId, enabledTools, aiTier, tenantFlags),
    getTenantChannelEntitlements(userId).catch((error: unknown) => {
      log.warn("Agent channel lookup failed; disabling customer send tools", {
        errorClass: error instanceof Error ? error.name : typeof error,
      });
      return { channels: [] };
    }),
  ]);
  const allowedTools = (tools: object[]) => {
    const computerTools = [
      AGENT_TOOL_DEFS.start_computer_task,
      AGENT_TOOL_DEFS.check_computer_task,
      AGENT_TOOL_DEFS.reply_computer_task,
      AGENT_TOOL_DEFS.stop_computer_task,
    ];
    const selectedComputerTools =
      enabledTools == null
        ? computerTools
        : Array.isArray(enabledTools)
          ? computerTools.filter((tool) => enabledTools.includes(tool.name))
          : [];
    const computerNames = new Set<string>(computerTools.map((tool) => tool.name));
    const selectedComputerNames = new Set<string>(selectedComputerTools.map((tool) => tool.name));
    const allowed = tools.filter((tool) => {
      const name = String((tool as { name?: unknown }).name || "");
      return (
        !UNVERIFIED_LIVE_TOOL_NAMES.has(name as AgentToolName) &&
        isAgentToolChannelAllowed(name, entitlements.channels) &&
        (!computerNames.has(name) || selectedComputerNames.has(name))
      );
    });
    // On a fresh or a cached schema alike.
    withAlwaysOnTools(allowed, (name) => isAgentToolChannelAllowed(name, entitlements.channels));
    // Reconcile stale schemas without expanding an explicit action selection.
    for (const computerTool of selectedComputerTools) {
      if (
        !UNVERIFIED_LIVE_TOOL_NAMES.has(computerTool.name as AgentToolName) &&
        isAgentToolChannelAllowed(computerTool.name, entitlements.channels) &&
        !allowed.some((tool) => (tool as { name?: unknown }).name === computerTool.name)
      ) {
        allowed.push(computerTool);
      }
    }
    return allowed;
  };
  if (cached) return allowedTools(cached);

  let resolved = applyPlanToolUnlocks(resolveAgentTools(enabledTools), aiTier);
  if (!tenantFlags?.twilioMessaging) {
    resolved = resolved.filter((n) => n !== "send_text_message");
  }
  if (!tenantFlags?.twilioLookup) {
    resolved = resolved.filter((n) => n !== "lookup_phone_number");
  }
  const conn = await loadTenantIntegrationConnections(userId);
  const toolNames = filterToolsByTenantConnections(resolved, conn) as AgentToolName[];
  const tools = toolNames.map((name) => AGENT_TOOL_DEFS[name]).filter(Boolean);

  await setCachedTenantToolDefs(userId, enabledTools, aiTier, tenantFlags, tools);
  return allowedTools(tools);
}
