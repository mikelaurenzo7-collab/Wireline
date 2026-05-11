import { timingSafeEqual } from "node:crypto";
import { IS_PROD } from "./server-context";

export const VAPI_WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || (IS_PROD ? "" : "wireline-secret-key");

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
export const MAX_CONTEXT_PREVIEW_LENGTH = 200;

export const PRESERVED_LEAD_STATUSES = '("Voicemail-Left","Callback-Scheduled","Blocked-DNC")';

export const SENTIMENT_ANGRY_SIGNALS = [
  "angry", "furious", "terrible", "horrible", "ridiculous", "unacceptable",
  "disgusting", "hate", "sue", "lawyer", "scam", "fraud", "cancel", "refund",
  "waste", "useless", "incompetent", "nightmare", "lawsuit", "overcharged",
  "false advertising", "wasted my time", "never again", "disgusted",
  "no one cares", "bbb complaint", "posting online", "absolutely ridiculous",
  "worst experience", "completely unacceptable", "outrageous",
  "unbelievable", "disappointed", "been on hold", "waiting forever",
  "third time calling", "calling back again", "no one helped", "terrible service",
  "fed up", "done with you", "this is a joke", "get me a supervisor",
];
export const SENTIMENT_POSITIVE_SIGNALS = [
  "great", "wonderful", "excellent", "perfect", "love", "thank you", "thanks",
  "appreciate", "happy", "fantastic", "amazing", "exactly", "that works", "sounds good",
  "let's move forward", "i'm interested", "send me the details", "sounds perfect",
  "let's do it", "i'll take it", "when can we start", "i'm sold", "sign me up",
  "that's exactly what i need", "makes total sense", "i'm ready", "let's go ahead",
  "sounds great", "perfect timing", "absolutely", "you've been very helpful",
  "i'll definitely", "book it", "yes please", "that's what i was looking for",
  "much better", "really appreciate", "you're the best", "makes sense",
];

export function buildCallerProfileBlock(pastCalls: any[], isOutbound = false): string {
  if (!pastCalls || pastCalls.length === 0) return "";
  const heading = isOutbound
    ? "## ⚡ CONTACT HISTORY — PRE-LOADED"
    : "## ⚡ CALLER PROFILE — PRE-LOADED";
  const instruction = isOutbound
    ? "INSTRUCTION: Reference this naturally. Do not recite it verbatim."
    : "INSTRUCTION: Reference this history naturally within the first 2 exchanges. Do not recite it verbatim.";
  const lines = pastCalls.map((c: any) =>
    `- [${new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}] ${(c.direction || "call").toUpperCase()} | Intent: ${c.intent_label || "unknown"} | Tone: ${c.sentiment || "neutral"} | ${c.summary}`
  );
  return `${heading}\n${isOutbound ? "This contact has called before. Review and use naturally:" : "This caller has contact history. Use this immediately — do NOT wait to call view_recent_interactions:"}\n${lines.join("\n")}\n${instruction}\n`;
}

export const OUTBOUND_ARCHETYPE_BY_ROLE: Record<string, string> = {
  sales:             'The Closer',
  lead_qualifier:    'The Closer',
  marketing:         'The Closer',
  customer_service:  'The Empath',
  technical_support: 'Support Tech',
  collections:       'The Collector',
  scheduler:         'Receptionist',
  receptionist:      'Receptionist',
};

export function getArchetypeConfig(archetype: string): { rules: string; temp: number } {
  switch (archetype) {
    case 'The Closer':
      return {
        rules: "You are a consultative closer. Lead with discovery — uncover the prospect's pain before pitching. If a lead hesitates, ask an open-ended question to surface the real objection, then address it with evidence. Offer a concrete next step (demo, proposal, decision call) in every conversation.",
        temp: 0.7,
      };
    case 'Support Tech':
      return {
        rules: "You are highly analytical, patient, and precise. You ask clarifying troubleshooting questions one at a time. You do not rush. You summarize your findings before proposing a fix, and you verify the fix worked before closing.",
        temp: 0.2,
      };
    case 'The Empath':
      return {
        rules: "If a caller sounds frustrated, your first words must be a validating statement like 'I completely hear you, that's incredibly stressful. Let me fix this for you.' You acknowledge before you fix, always.",
        temp: 0.6,
      };
    case 'The Collector':
      return {
        rules: "You are firm, professional, and fully compliant with debt collection regulations. You always verify identity before discussing account details. You present the balance factually, listen to the customer's situation, and offer payment plan options before escalating. You never threaten, never harass, and document every promise made.",
        temp: 0.3,
      };
    default: // Receptionist
      return {
        rules: "You are an expert at handling phone calls where people are often in a hurry. Never use platitudes like 'I hope you're having a wonderful day.' Get straight to the value. You are cheerful, polite, and highly efficient.",
        temp: 0.4,
      };
  }
}

export const VAPI_TOOL_DEFS = {
  view_recent_interactions: {
    name: "view_recent_interactions",
    description: "Retrieves recent call history and open tasks for this caller. Use this to provide continuity if they reference a previous conversation or status.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  escalate_to_human: {
    name: "escalate_to_human",
    description: "Transfers the call to a human agent. Use if the caller is very upset, asks for a real person more than once, the issue is beyond your authority, or legal/liability language is used.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief reason for the escalation (e.g. 'Caller requested a supervisor', 'Legal threat — needs manager', 'Complex billing dispute beyond agent authority'). Used to brief the human agent taking the call.",
        },
      },
      required: ["reason"],
    },
  },
  create_fleet_task: {
    name: "create_fleet_task",
    description: "Creates a follow-up task for a human team member. Use for complex issues you cannot resolve on the call.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Detailed description of what needs to be done." },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Urgency level." },
      },
      required: ["description", "priority"],
    },
  },
  send_email: {
    name: "send_email",
    description: "Sends an email to the customer for confirmations, quotes, or follow-up information discussed on the call.",
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
  check_calendar_availability: {
    name: "check_calendar_availability",
    description: "Checks the calendar for already-booked times on a date. ALWAYS run this before confirming any appointment slot.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "The date to check (e.g., 'October 15', 'Next Tuesday')." },
      },
      required: ["date"],
    },
  },
  book_appointment: {
    name: "book_appointment",
    description: "Books an appointment. Only use AFTER confirming availability with check_calendar_availability.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Appointment date (e.g., 'Tuesday', 'Oct 15')." },
        time: { type: "string", description: "Appointment time (e.g., '2 PM')." },
        customer_name: { type: "string", description: "Caller's full name." },
        service_type: { type: "string", description: "Type of service (e.g., 'HVAC Repair', 'Plumbing Inspection')." },
      },
      required: ["date", "time", "customer_name", "service_type"],
    },
  },
  search_leads: {
    name: "search_leads",
    description: "Searches the lead database for existing customer records. Use to pull context before discussing account history.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Customer name, email, or phone number to search for." },
      },
      required: ["query"],
    },
  },
  update_lead_status: {
    name: "update_lead_status",
    description: "Updates the lead's status in the CRM based on the outcome of this call. Use at the end of every commercial interaction.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["qualified", "not_interested", "callback_requested", "proposal_sent", "closed_won", "closed_lost"],
          description: "The outcome of this interaction.",
        },
        notes: { type: "string", description: "One sentence summarising why this status was set." },
      },
      required: ["status", "notes"],
    },
  },
  log_payment_promise: {
    name: "log_payment_promise",
    description: "Records a payment promise made by the customer during a collections call. REQUIRED whenever a payment commitment is made — FDCPA compliance.",
    parameters: {
      type: "object",
      properties: {
        amount_promised: { type: "string", description: "The dollar amount the customer agreed to pay (e.g., '$250')." },
        payment_date: { type: "string", description: "The date they committed to pay (e.g., 'Friday June 7th')." },
        payment_method: { type: "string", description: "How they will pay (e.g., 'credit card over phone', 'check by mail', 'online portal')." },
      },
      required: ["amount_promised", "payment_date"],
    },
  },
  create_support_ticket: {
    name: "create_support_ticket",
    description: "Creates a formal support ticket for issues requiring engineering or specialist review. Use when you cannot resolve the issue on the call.",
    parameters: {
      type: "object",
      properties: {
        issue_summary: { type: "string", description: "Concise description of the technical problem." },
        error_codes: { type: "string", description: "Any error codes or messages the customer reported (leave blank if none)." },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"], description: "Impact severity of this issue." },
      },
      required: ["issue_summary", "severity"],
    },
  },
  leave_voicemail: {
    name: "leave_voicemail",
    description: "Call this tool IMMEDIATELY when you detect you have reached an answering machine or voicemail. After calling it, deliver a concise 15-20 second voicemail and then say goodbye to end the call.",
    parameters: {
      type: "object",
      properties: {
        voicemail_message: { type: "string", description: "The exact text of the voicemail you are about to leave (15-20 seconds when spoken)." },
      },
      required: ["voicemail_message"],
    },
  },
  schedule_callback: {
    name: "schedule_callback",
    description: "Schedules an automatic callback for this contact at a specific date and time they requested. Use when the contact says they are busy and asks to be called back later. The system will automatically re-dial them at the promised time — confirm the time to the caller before ending the call.",
    parameters: {
      type: "object",
      properties: {
        callback_datetime: {
          type: "string",
          description: "ISO 8601 datetime for the callback in the contact's local timezone (e.g. '2026-05-07T14:00:00-05:00'). Calculate this from what the caller says — 'Tuesday at 2pm', 'tomorrow morning at 10', 'next Monday afternoon'. Today is injected into your system prompt so you can calculate the correct date.",
        },
        notes: {
          type: "string",
          description: "Context to include when calling back — what you were discussing, what to follow up on.",
        },
      },
      required: ["callback_datetime", "notes"],
    },
  },
  capture_customer_profile: {
    name: "capture_customer_profile",
    description: "Saves structured notes about the customer gathered during this call. Call this any time you learn something meaningful — budget range, timeline, key pain points, objections, decision-maker status, or interests. This enriches the customer's profile so the next agent has full context and doesn't repeat questions.",
    parameters: {
      type: "object",
      properties: {
        pain_points: {
          type: "string",
          description: "The customer's main challenges or frustrations as they expressed them, in their own words or a close paraphrase.",
        },
        budget_range: {
          type: "string",
          description: "Any budget or price range mentioned (e.g., '$5,000–$10,000/year', 'Under $500/month'). Leave blank if not discussed.",
        },
        timeline: {
          type: "string",
          description: "Urgency or timeline they mentioned (e.g., 'Needs solution by Q3', 'Just researching for now'). Leave blank if not discussed.",
        },
        decision_authority: {
          type: "string",
          enum: ["decision_maker", "influencer", "gatekeeper", "unknown"],
          description: "Whether this person can sign off on a purchase or must involve others.",
        },
        objections: {
          type: "string",
          description: "Any hesitations, objections, or concerns raised (e.g., 'Worried about switching costs', 'Already evaluating Competitor X'). Leave blank if none.",
        },
        interests: {
          type: "string",
          description: "Features, outcomes, or topics they expressed genuine interest in.",
        },
        next_step_agreed: {
          type: "string",
          description: "Any concrete next step both parties agreed on (e.g., 'Demo on Friday', 'Will send proposal by EOD'). Leave blank if none.",
        },
      },
      required: ["pain_points", "decision_authority"],
    },
  },
} as const;

export type VapiToolName = keyof typeof VAPI_TOOL_DEFS;

export const ROLE_TOOL_SETS: Record<string, VapiToolName[]> = {
  sales:             ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "update_lead_status", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  customer_service:  ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "update_lead_status", "check_calendar_availability", "book_appointment", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  scheduler:         ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "check_calendar_availability", "book_appointment", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  collections:       ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "log_payment_promise", "update_lead_status", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  technical_support: ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "update_lead_status", "create_support_ticket", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  lead_qualifier:    ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "update_lead_status", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  receptionist:      ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "check_calendar_availability", "book_appointment", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
  marketing:         ["view_recent_interactions", "escalate_to_human", "create_fleet_task", "send_email", "search_leads", "update_lead_status", "leave_voicemail", "schedule_callback", "capture_customer_profile"],
};

export const ROLE_SPECIFIC_PROTOCOLS: Record<string, string> = {
  sales:             "Always assume the sale. If the caller is interested, book a follow-up demo or meeting immediately using book_appointment. Use capture_customer_profile to record budget and timeline before the call ends.",
  customer_service:  "Be helpful and empathetic. Use view_recent_interactions to see if they've called about this issue before. If the issue is complex, create_fleet_task for the back-office team.",
  collections:       "Remain professional and firm but compliant. You MUST verify the caller's identity before discussing debt details. Use log_payment_promise to record all commitments — this is a legal requirement.",
  technical_support: "Be methodical. Use search_leads to find their product version or history. If you cannot solve it, use create_support_ticket to escalate to engineering.",
  scheduler:         "Your goal is a confirmed appointment. ALWAYS check_calendar_availability before suggesting a time. Use send_email to send the calendar invite immediately after booking.",
};

export function buildRoleToolDefs(role: string): object[] {
  const toolNames = ROLE_TOOL_SETS[role] ?? ROLE_TOOL_SETS["customer_service"];
  return toolNames.map(name => VAPI_TOOL_DEFS[name]);
}
