/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { timingSafeEqual } from "node:crypto";
import { applyPlanToolUnlocks, resolveAgentTools } from "./agent-capabilities";
import {
  filterToolsByTenantConnections,
  loadTenantIntegrationConnections,
} from "./tenant-integration-connections";
import { DEFAULT_AGENT_ROLE } from "./agent-constants";

// Webhook auth secret. Production rejects webhooks when this is unset
// (see src/routes/vapi-v2.ts); dev accepts all when unset. We never ship a
// guessable fallback secret in the bundle — an empty string in dev simply
// means "no shared secret configured" and matches the route's dev-accept path.
export const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || "";

export function timingSafeEq(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function sanitizePhone(phone: string | undefined | null): string {
  return (phone || "").replace(/[^0-9+]/g, "").slice(0, 20);
}

export const KNOWLEDGE_GAP_PREFIX = "[KNOWLEDGE GAP]";
export const MAX_RUNTIME_LESSONS = 5;
export const MAX_RUNTIME_DIRECTIVES = 24;
export const MAX_RUNTIME_KNOWLEDGE = 18;
/** Vapi re-sends the full system prompt each turn — provider-side prompt caching is the largest cost lever (track with Vapi). */
export const MAX_RUNTIME_PROMPT_CHARS = 18_000;
export const MAX_RUNTIME_SNIPPET_CHARS = 360;
export const MAX_CONTEXT_PREVIEW_LENGTH = 200;

export function truncateRuntimeSnippet(text: string, max = MAX_RUNTIME_SNIPPET_CHARS): string {
  const t = (text || "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function clampRuntimePrompt(text: string, max = MAX_RUNTIME_PROMPT_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n[Context trimmed for voice latency — use tools for account-specific detail.]`;
}

/** Runtime guardrail sections appended by buildAgentRuntimeContext — never truncate these. */
const RUNTIME_GUARDRAIL_MARKERS = [
  "\n\n## VOICE CONSISTENCY",
  "\n\n## COMPLIANCE",
  "\n\n## ESCALATION",
  "\n\n## DO NOT DISCUSS",
] as const;

const RUNTIME_TRIM_NOTICE =
  "\n\n[Context trimmed for voice latency — use tools for account-specific detail.]";

/**
 * Clamp an assembled runtime prompt without dropping compliance / escalation /
 * voice-consistency guardrails appended at the tail by buildAgentRuntimeContext.
 */
export function clampRuntimePromptPreservingTail(
  text: string,
  max = MAX_RUNTIME_PROMPT_CHARS,
): string {
  if (text.length <= max) return text;

  for (const marker of RUNTIME_GUARDRAIL_MARKERS) {
    const idx = text.lastIndexOf(marker);
    if (idx <= 0) continue;
    const tail = text.slice(idx);
    const headBudget = max - tail.length - RUNTIME_TRIM_NOTICE.length;
    if (headBudget < 500) continue;
    return `${text.slice(0, headBudget)}${RUNTIME_TRIM_NOTICE}${tail}`;
  }

  return clampRuntimePrompt(text, max);
}

/**
 * Sticky lead statuses that the in-call `update_lead_status` tool must not
 * overwrite. Each represents a deliberate decision (DNC suppression,
 * scheduled retry, voicemail outcome) that an agent should never undo
 * mid-conversation. Consumed via Drizzle's `inArray(...)` so this MUST be a
 * real JS array — earlier this was a parenthesised SQL string passed to
 * `inArray(... as any)`, which made the guard match nothing and let agents
 * stomp protected statuses.
 */
export const PRESERVED_LEAD_STATUSES: readonly string[] = [
  "Voicemail-Left",
  "Callback-Scheduled",
  "Blocked-DNC",
];

export const SENTIMENT_ANGRY_SIGNALS = [
  "angry",
  "furious",
  "terrible",
  "horrible",
  "ridiculous",
  "unacceptable",
  "disgusting",
  "hate",
  "sue",
  "lawyer",
  "scam",
  "fraud",
  "cancel",
  "refund",
  "waste",
  "useless",
  "incompetent",
  "nightmare",
  "lawsuit",
  "overcharged",
  "false advertising",
  "wasted my time",
  "never again",
  "disgusted",
  "no one cares",
  "bbb complaint",
  "posting online",
  "absolutely ridiculous",
  "worst experience",
  "completely unacceptable",
  "outrageous",
  "unbelievable",
  "disappointed",
  "been on hold",
  "waiting forever",
  "third time calling",
  "calling back again",
  "no one helped",
  "terrible service",
  "fed up",
  "done with you",
  "this is a joke",
  "get me a supervisor",
];
export const SENTIMENT_POSITIVE_SIGNALS = [
  "great",
  "wonderful",
  "excellent",
  "perfect",
  "love",
  "thank you",
  "thanks",
  "appreciate",
  "happy",
  "fantastic",
  "amazing",
  "exactly",
  "that works",
  "sounds good",
  "let's move forward",
  "i'm interested",
  "send me the details",
  "sounds perfect",
  "let's do it",
  "i'll take it",
  "when can we start",
  "i'm sold",
  "sign me up",
  "that's exactly what i need",
  "makes total sense",
  "i'm ready",
  "let's go ahead",
  "sounds great",
  "perfect timing",
  "absolutely",
  "you've been very helpful",
  "i'll definitely",
  "book it",
  "yes please",
  "that's what i was looking for",
  "much better",
  "really appreciate",
  "you're the best",
  "makes sense",
];

export function buildCallerProfileBlock(pastCalls: any[], isOutbound = false): string {
  if (!pastCalls || pastCalls.length === 0) return "";
  const heading = isOutbound
    ? "## ⚡ CONTACT HISTORY — PRE-LOADED"
    : "## ⚡ CALLER PROFILE — PRE-LOADED";
  const instruction = isOutbound
    ? "INSTRUCTION: Reference this naturally. Do not recite it verbatim."
    : "INSTRUCTION: Reference this history naturally within the first 2 exchanges. Do not recite it verbatim.";
  const lines = pastCalls.map(
    (c: any) =>
      `- [${new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}] ${(c.direction || "call").toUpperCase()} | Intent: ${c.intent_label || "unknown"} | Tone: ${c.sentiment || "neutral"} | ${c.summary}`,
  );
  return `${heading}\n${isOutbound ? "This contact has called before. Review and use naturally:" : "This caller has contact history. Use this immediately — do NOT wait to call view_recent_interactions:"}\n${lines.join("\n")}\n${instruction}\n`;
}

/** Map Wireline persona roles (wireline_sales, etc.) to voice-runtime role keys. */
const OUTBOUND_VOICE_ROLE_ALIASES: Record<string, string> = {
  wireline_sales: "sales",
  wireline_reception: "receptionist",
  wireline_support: "customer_service",
  wireline_technical: "technical_support",
  wireline_onboarding: "scheduler",
};

export function mapOutboundVoiceRole(role: string | null | undefined): string {
  if (!role) return DEFAULT_AGENT_ROLE;
  return OUTBOUND_VOICE_ROLE_ALIASES[role] ?? role.replace(/^wireline_/, "");
}

export const OUTBOUND_ARCHETYPE_BY_ROLE: Record<string, string> = {
  sales: "The Closer",
  lead_qualifier: "The Closer",
  marketing: "The Closer",
  customer_service: "The Empath",
  technical_support: "Support Tech",
  collections: "The Collector",
  scheduler: "Receptionist",
  receptionist: "Receptionist",
};

export function getArchetypeConfig(archetype: string): { rules: string; temp: number } {
  switch (archetype) {
    case "The Closer":
      return {
        rules:
          "You are a consultative closer. Lead with discovery — uncover the prospect's pain before pitching. If a lead hesitates, ask an open-ended question to surface the real objection, then address it with evidence. Offer a concrete next step (demo, proposal, decision call) in every conversation.",
        temp: 0.7,
      };
    case "Support Tech":
      return {
        rules:
          "You are highly analytical, patient, and precise. You ask clarifying troubleshooting questions one at a time. You do not rush. You summarize your findings before proposing a fix, and you verify the fix worked before closing.",
        temp: 0.2,
      };
    case "The Empath":
      return {
        rules:
          "If a caller sounds frustrated, your first words must be a validating statement like 'I completely hear you, that's incredibly stressful. Let me fix this for you.' You acknowledge before you fix, always. Hold your own calm, steady voice throughout — do not raise your energy or speed up to match an upset caller; your steadiness is what de-escalates them.",
        temp: 0.6,
      };
    case "The Collector":
      return {
        rules:
          "You are firm, professional, and fully compliant with debt collection regulations. You always verify identity before discussing account details. You present the balance factually, listen to the customer's situation, and offer payment plan options before escalating. You never threaten, never harass, and document every promise made.",
        temp: 0.3,
      };
    default: // Receptionist
      return {
        rules:
          "You are an expert at handling phone calls where people are often in a hurry. Never use platitudes like 'I hope you're having a wonderful day.' Get straight to the value. You are cheerful, polite, and highly efficient.",
        temp: 0.4,
      };
  }
}

export const VAPI_TOOL_DEFS = {
  view_recent_interactions: {
    name: "view_recent_interactions",
    description:
      "Retrieves recent call history and open tasks for this caller. Use this to provide continuity if they reference a previous conversation or status.",
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
            "Brief reason for the escalation (e.g. 'Caller requested a supervisor', 'Legal threat — needs manager', 'Complex billing dispute beyond agent authority'). Used to brief the human agent taking the call.",
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
      "Sends an email to the customer for confirmations, quotes, or follow-up information discussed on the call.",
    parameters: {
      type: "object",
      properties: {
        to_email: { type: "string", description: "Customer's email address." },
        subject: { type: "string", description: "Email subject line." },
        body: { type: "string", description: "Email body content." },
      },
      required: ["to_email", "subject", "body"],
    },
  },
  send_text_message: {
    name: "send_text_message",
    description:
      // "SMS" → "text message" because Vapi TTS reads "SMS" letter-by-letter
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
      "Checks the calendar for already-booked times on a date. ALWAYS run this before confirming any appointment slot.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "The date to check (e.g., 'October 15', 'Next Tuesday').",
        },
      },
      required: ["date"],
    },
  },
  book_appointment: {
    name: "book_appointment",
    description:
      "Books an appointment. Only use AFTER confirming availability with check_calendar_availability.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Appointment date (e.g., 'Tuesday', 'Oct 15')." },
        time: { type: "string", description: "Appointment time (e.g., '2 PM')." },
        customer_name: { type: "string", description: "Caller's full name." },
        service_type: {
          type: "string",
          description: "Type of service (e.g., 'HVAC Repair', 'Plumbing Inspection').",
        },
      },
      required: ["date", "time", "customer_name", "service_type"],
    },
  },
  search_leads: {
    name: "search_leads",
    description:
      "Searches the lead database for existing customer records. Use to pull context before discussing account history.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Customer name, email, or phone number to search for.",
        },
      },
      required: ["query"],
    },
  },
  update_lead_status: {
    name: "update_lead_status",
    description:
      "Updates the lead's status in the CRM based on the outcome of this call. Use at the end of every commercial interaction.",
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
      "Records a payment promise made by the customer during a collections call. REQUIRED whenever a payment commitment is made — FDCPA compliance.",
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
      "Schedules an automatic callback for this contact at a specific date and time they requested. Use when the contact says they are busy and asks to be called back later. The system will automatically re-dial them at the promised time — confirm the time to the caller before ending the call.",
    parameters: {
      type: "object",
      properties: {
        callback_datetime: {
          type: "string",
          description:
            "ISO 8601 datetime for the callback in the contact's local timezone (e.g. '2026-05-07T14:00:00-05:00'). Calculate this from what the caller says — 'Tuesday at 2pm', 'tomorrow morning at 10', 'next Monday afternoon'. Today is injected into your system prompt so you can calculate the correct date.",
        },
        notes: {
          type: "string",
          description:
            "Context to include when calling back — what you were discussing, what to follow up on.",
        },
      },
      required: ["callback_datetime", "notes"],
    },
  },
  capture_customer_profile: {
    name: "capture_customer_profile",
    description:
      "Saves structured notes about the customer gathered during this call. Call this any time you learn something meaningful — budget range, timeline, key pain points, objections, decision-maker status, or interests. This enriches the customer's profile so the next agent has full context and doesn't repeat questions.",
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
            "Any budget or price range mentioned (e.g., '$5,000–$10,000/year', 'Under $500/month'). Leave blank if not discussed.",
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
      "Notify the team via Slack about an important call outcome — hot lead, booked meeting, escalation, or deal milestone. Only use when something noteworthy happened that the team should see immediately.",
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
      "List recent @mentions for the connected X account — useful before replying to comments.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "How many mentions to return (1–25, default 10).",
        },
      },
    },
  },
  list_x_ad_campaigns: {
    name: "list_x_ad_campaigns",
    description:
      "List X Ads campaigns for the Wireline ads account. Requires platform Ads API credentials.",
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
  crm_search_contacts: {
    name: "crm_search_contacts",
    description:
      "Search the connected CRM (Salesforce or HubSpot) for existing contact records matching the caller's info.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query — name, email, phone, or company." },
      },
      required: ["query"],
    },
  },
  crm_log_call: {
    name: "crm_log_call",
    description: "Log this call's outcome and notes to the connected CRM contact record.",
    parameters: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "CRM contact ID to log against." },
        subject: { type: "string", description: "Brief subject line for the activity." },
        notes: { type: "string", description: "Call notes / outcome summary." },
      },
      required: ["contact_id", "subject"],
    },
  },
  crm_create_opportunity: {
    name: "crm_create_opportunity",
    description: "Create a new opportunity/deal in the connected CRM from a qualified call.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Opportunity / deal name." },
        contact_id: { type: "string", description: "CRM contact ID to associate." },
        stage: { type: "string", description: "Pipeline stage." },
        amount: { type: "number", description: "Estimated deal value." },
      },
      required: ["name"],
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
  enrich_lead: {
    name: "enrich_lead",
    description:
      "Enriches a phone number to discover the caller's professional identity (name, title, company) via Apollo.io. Use this at the start of a call if you only have a phone number.",
    parameters: {
      type: "object",
      properties: {
        phone_number: {
          type: "string",
          description:
            "The phone number to enrich. Leave blank to use the current caller's number.",
        },
      },
      required: [],
    },
  },
  gemini_ground: {
    name: "gemini_ground",
    description:
      "Looks up fresh public information via grounded web search. Use ONLY when the caller asks something that isn't in your knowledge base AND requires current public info — competitor pricing, news headlines, today's weather, business hours, regulatory updates. Returns a concise answer with citations. Do NOT use for internal customer data — that's what search_leads / crm_search_contacts / view_recent_interactions are for.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The search query. Phrase as a self-contained question — e.g. 'current AWS S3 standard storage pricing per GB' or 'restaurant Chicago Lou Malnati closing time Thursday'.",
        },
      },
      required: ["query"],
    },
  },
  shopify_lookup_order: {
    name: "shopify_lookup_order",
    description:
      "Looks up a customer's Shopify order by order number or email. Returns the order status, payment status, fulfillment / tracking info, line items, and total. Use this when a caller asks 'where is my order' or about a recent purchase.",
    parameters: {
      type: "object",
      properties: {
        order_number: {
          type: "string",
          description: "The order number, e.g. '1001' or '#1001'. Ask the caller for this.",
        },
        email: {
          type: "string",
          description:
            "The customer's email — use to find their most recent order when no order number is known.",
        },
      },
      required: [],
    },
  },
  shopify_check_inventory: {
    name: "shopify_check_inventory",
    description:
      "Searches the Shopify store catalog for a product by name and returns its variants, prices, and live inventory (in-stock) levels. Use when a caller asks if something is in stock or about a price.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product name or keyword to search for." },
      },
      required: ["query"],
    },
  },
  shopify_lookup_customer: {
    name: "shopify_lookup_customer",
    description:
      "Looks up a Shopify customer by email or phone and returns their profile plus recent order history. Use to recognize a returning customer or review what they've bought.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string", description: "The customer's email address." },
        phone: {
          type: "string",
          description: "The customer's phone number. Leave blank to use the caller's number.",
        },
      },
      required: [],
    },
  },
  shopify_start_return: {
    name: "shopify_start_return",
    description:
      "Opens a return request for a Shopify order. This STARTS the return only — it does NOT issue a refund; a team member reviews and approves any money back. Confirm the order and reason with the caller first.",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description:
            "The Shopify order ID (numeric). Get this from shopify_lookup_order first if you only have the order number.",
        },
        reason: {
          type: "string",
          description:
            "Why the customer wants to return — e.g. 'wrong size', 'item defective', 'arrived late'.",
        },
      },
      required: ["order_id", "reason"],
    },
  },
  shopify_cancel_order: {
    name: "shopify_cancel_order",
    description:
      "Cancels a Shopify order. Only do this when the caller explicitly asks to cancel and the order has not shipped. Confirm the order with them before cancelling.",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description:
            "The Shopify order ID (numeric). Get this from shopify_lookup_order if you only have the order number.",
        },
      },
      required: ["order_id"],
    },
  },
  shopify_update_address: {
    name: "shopify_update_address",
    description:
      "Updates the shipping address on a Shopify order. Use when a caller realizes they entered the wrong address and the order has not yet shipped. Read the new address back to confirm before saving.",
    parameters: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "The Shopify order ID (numeric)." },
        address1: { type: "string", description: "Street address line 1." },
        address2: { type: "string", description: "Street address line 2 (apt/suite)." },
        city: { type: "string", description: "City." },
        province: { type: "string", description: "State / province." },
        zip: { type: "string", description: "ZIP / postal code." },
        country: { type: "string", description: "Country." },
        name: { type: "string", description: "Recipient name." },
      },
      required: ["order_id"],
    },
  },
  shopify_create_draft_order: {
    name: "shopify_create_draft_order",
    description:
      "Creates a Shopify draft order for a phone sale and returns a payment/invoice link. Use when the caller wants to buy now but did not check out online. Confirm line items and quantity first.",
    parameters: {
      type: "object",
      properties: {
        variant_id: {
          type: "string",
          description: "Product variant ID from shopify_check_inventory (preferred).",
        },
        product_title: { type: "string", description: "Custom line title if no variant_id." },
        price: { type: "string", description: "Unit price for a custom line (e.g. 29.99)." },
        quantity: { type: "number", description: "Quantity to order." },
        customer_email: { type: "string", description: "Customer email for the invoice." },
        customer_first_name: { type: "string", description: "Customer first name." },
        customer_last_name: { type: "string", description: "Customer last name." },
      },
      required: ["quantity"],
    },
  },
  shopify_add_order_note: {
    name: "shopify_add_order_note",
    description:
      "Adds an internal note on a Shopify order for the merchant team (call summary, VIP flag, special handling). Use after resolving an issue so staff see context in admin.",
    parameters: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Shopify order ID from shopify_lookup_order." },
        note: { type: "string", description: "Short note for the merchant (plain text)." },
      },
      required: ["order_id", "note"],
    },
  },
  square_lookup_order: {
    name: "square_lookup_order",
    description:
      "Looks up a Square order by order ID or the customer's email address. Returns order status, line items, totals, and fulfillment state. Use when a caller asks about a purchase made through Square.",
    parameters: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The Square order ID. Ask the caller for this if they have it.",
        },
        email: {
          type: "string",
          description:
            "The customer's email — use to find their most recent order when no order ID is known.",
        },
      },
      required: [],
    },
  },
  square_lookup_customer: {
    name: "square_lookup_customer",
    description:
      "Finds a Square customer by email or phone and returns their profile and recent purchase history. Use to recognize a returning customer or review prior purchases.",
    parameters: {
      type: "object",
      properties: {
        email: { type: "string", description: "The customer's email address." },
        phone: {
          type: "string",
          description: "The customer's phone number. Leave blank to use the caller's number.",
        },
      },
      required: [],
    },
  },
  square_check_inventory: {
    name: "square_check_inventory",
    description:
      "Searches the Square item catalog for a product by name and returns its variants, prices, and live inventory levels. Use when a caller asks if something is available or what it costs.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Product name or keyword to search for." },
      },
      required: ["query"],
    },
  },
  square_create_payment_link: {
    name: "square_create_payment_link",
    description:
      "Generates a Square checkout payment link for a product or service. Only use this after confirming the item name and price with the caller. Send the link via SMS or email.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Name of the product or service the payment is for.",
        },
        amount_dollars: {
          type: "number",
          description: "Amount to charge in dollars (e.g. 49.99).",
        },
      },
      required: ["title", "amount_dollars"],
    },
  },
  send_teams_message: {
    name: "send_teams_message",
    description:
      "Notify the team via Microsoft Teams about an important call outcome — hot lead, booked meeting, escalation, or deal milestone. Only use when something noteworthy happened that the team should see immediately.",
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
      "Append a row to the Account Holder's Wireline Call Log spreadsheet in OneDrive — records the caller, the outcome, and a short detail. Use at the end of a call to keep a running log the Account Holder can review in Excel.",
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
            "Short outcome label — e.g. 'Booked', 'Qualified lead', 'No answer', 'Escalated'.",
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
      "Append a row to the Account Holder's Wireline Call Log spreadsheet in Google Drive — records the caller, the outcome, and a short detail. Use at the end of a call to keep a running log the Account Holder can review in Google Sheets.",
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
            "Short outcome label — e.g. 'Booked', 'Qualified lead', 'No answer', 'Escalated'.",
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
} as const;

export type VapiToolName = keyof typeof VAPI_TOOL_DEFS;

export const ROLE_SPECIFIC_PROTOCOLS: Record<string, string> = {
  sales:
    "Always assume the sale. If the caller is interested, book a follow-up demo or meeting immediately using book_appointment. Use capture_customer_profile to record budget and timeline before the call ends.",
  customer_service:
    "Be helpful and empathetic. Use view_recent_interactions to see if they've called about this issue before. If the issue is complex, create_followup_task for the back-office team. Only use send_text_message after the caller explicitly asks for a text or confirms that channel is okay.",
  collections:
    "Remain professional and firm but compliant. You MUST verify the caller's identity before discussing debt details. Use log_payment_promise to record all commitments — this is a legal requirement. If the customer opts out of future contact, use add_to_dnc immediately.",
  technical_support:
    "Be methodical. Use search_leads to find their product version or history. If you cannot solve it, use create_support_ticket to escalate to engineering.",
  scheduler:
    "Your goal is a confirmed appointment. ALWAYS check_calendar_availability before suggesting a time. Use send_email to send the calendar invite immediately after booking, and use send_text_message only if the customer asked for a text confirmation.",
  lead_qualifier:
    "Qualify fast: budget, timeline, authority, need. Use enrich_lead when you have a company or email. Book a demo with book_appointment when qualified; notify the team on Slack or Teams for hot leads.",
  marketing:
    "Capture campaign interest and next steps. Use enrich_lead for unknown companies; log outcomes with update_lead_status. Offer book_appointment for demos or nurture with send_email.",
};

export function buildRoleToolDefs(role: string, enabledTools?: unknown): object[] {
  const toolNames = resolveAgentTools(role, enabledTools) as VapiToolName[];
  return toolNames.map((name) => VAPI_TOOL_DEFS[name]).filter(Boolean);
}

/** Connection-aware tool list for live assistants — omits tools the tenant has not OAuth'd. */
export async function buildRoleToolDefsForTenant(
  role: string,
  enabledTools: unknown,
  userId: string,
  aiTier?: string | null,
  tenantFlags?: { twilioMessaging?: boolean; twilioLookup?: boolean },
): Promise<object[]> {
  const { getCachedTenantToolDefs, setCachedTenantToolDefs } = await import("./tenant-tools-cache");

  const cached = await getCachedTenantToolDefs(userId, role, enabledTools, aiTier, tenantFlags);
  if (cached) return cached;

  let resolved = applyPlanToolUnlocks(resolveAgentTools(role, enabledTools), aiTier);
  if (!tenantFlags?.twilioMessaging) {
    resolved = resolved.filter((n) => n !== "send_text_message");
  }
  if (!tenantFlags?.twilioLookup) {
    resolved = resolved.filter((n) => n !== "lookup_phone_number");
  }
  const conn = await loadTenantIntegrationConnections(userId);
  const toolNames = filterToolsByTenantConnections(resolved, conn) as VapiToolName[];
  const tools = toolNames.map((name) => VAPI_TOOL_DEFS[name]).filter(Boolean);

  await setCachedTenantToolDefs(userId, role, enabledTools, aiTier, tenantFlags, tools);
  return tools;
}
