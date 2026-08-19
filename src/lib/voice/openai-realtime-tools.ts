import type { OpenAIRealtimeToolDefinition } from "./openai-realtime-config";

export const OPENAI_REALTIME_WIRELINE_TOOLS: OpenAIRealtimeToolDefinition[] = [
  {
    type: "function",
    name: "get_caller_info",
    description: "Retrieve caller identity and account context available to this BotBound Bot.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "search_knowledge_base",
    description: "Search approved BotBound Bot knowledge and business policy content.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Precise policy, product, service, pricing, or procedure question.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "check_calendar_availability",
    description: "Check available appointment slots before offering or confirming a booking.",
    parameters: {
      type: "object",
      properties: {
        service_type: { type: "string", description: "Type of service or appointment requested." },
        date_time_window: { type: "string", description: "Natural language date or time window." },
      },
      required: ["service_type", "date_time_window"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_booking",
    description:
      "Create a booking only after availability is checked and the caller confirms the exact time.",
    parameters: {
      type: "object",
      properties: {
        service_type: { type: "string", description: "Type of service or appointment." },
        date_time: { type: "string", description: "Confirmed date and time." },
        customer_name: { type: "string", description: "Customer name for the booking." },
      },
      required: ["service_type", "date_time", "customer_name"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "schedule_callback",
    description: "Schedule a callback when the caller asks to be contacted later.",
    parameters: {
      type: "object",
      properties: {
        date_time: { type: "string", description: "Requested callback time." },
        reason: { type: "string", description: "Reason for the callback." },
      },
      required: ["date_time", "reason"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "send_follow_up",
    description: "Send a customer follow-up message through an enabled BotBound messaging channel.",
    parameters: {
      type: "object",
      properties: {
        channel: { type: "string", enum: ["sms", "email"], description: "Follow-up channel." },
        message: { type: "string", description: "Message body." },
        purpose: { type: "string", description: "Why the follow-up is being sent." },
      },
      required: ["channel", "message", "purpose"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "escalate_to_human",
    description:
      "Escalate to a human specialist when requested, required by policy, or the task cannot be completed safely.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Specific reason for escalation." },
        urgency: {
          type: "string",
          enum: ["low", "normal", "high"],
          description: "Escalation urgency.",
        },
      },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_followup_task",
    description: "Create a visible follow-up task for any promised human action.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title." },
        description: { type: "string", description: "Detailed task description and context." },
        priority: {
          type: "string",
          enum: ["low", "normal", "high"],
          description: "Task priority.",
        },
      },
      required: ["title", "description"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "capture_customer_profile",
    description: "Capture useful customer intelligence learned during the conversation.",
    parameters: {
      type: "object",
      properties: {
        note: { type: "string", description: "Customer intelligence to remember." },
        category: {
          type: "string",
          description:
            "Category such as pain_point, budget, timeline, objection, preference, or next_step.",
        },
      },
      required: ["note", "category"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_call_outcome",
    description: "Log the final outcome before ending a meaningful live call.",
    parameters: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: [
            "booked",
            "qualified",
            "callback_scheduled",
            "message_taken",
            "escalated",
            "not_interested",
            "wrong_number",
            "voicemail",
            "unresolved",
          ],
          description: "Final call outcome.",
        },
        summary: { type: "string", description: "One-paragraph call recap." },
      },
      required: ["outcome", "summary"],
      additionalProperties: false,
    },
  },
];
