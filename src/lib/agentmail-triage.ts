export interface EmailTriageResult {
  intent: "reschedule" | "cancel" | "urgent_complaint" | "general_inquiry";
  confidence: number;
  requiresHumanEscalation: boolean;
  recommendedAction: string;
}

export function triageInboundCustomerReply(subject: string, body: string): EmailTriageResult {
  const combined = `${subject} ${body}`.toLowerCase();

  // Cancel detection (even with reasons like family emergency)
  const hasCancelKeywords =
    combined.includes("cancel") ||
    combined.includes("don't come") ||
    combined.includes("no longer need") ||
    combined.includes("call off");

  // Severe property damage or legal threat
  const hasSevereThreat =
    combined.includes("leak") ||
    combined.includes("flood") ||
    combined.includes("burst") ||
    combined.includes("lawyer") ||
    combined.includes("sue") ||
    combined.includes("terrible") ||
    combined.includes("unacceptable");

  if (hasCancelKeywords && !hasSevereThreat) {
    return {
      intent: "cancel",
      confidence: 0.94,
      requiresHumanEscalation: false,
      recommendedAction: "Release appointment slot, free travel buffers, and dispatch cancellation receipt",
    };
  }

  // Urgent complaint detection
  if (hasSevereThreat || combined.includes("urgent") || combined.includes("emergency")) {
    return {
      intent: "urgent_complaint",
      confidence: 0.96,
      requiresHumanEscalation: true,
      recommendedAction: "Escalate to business owner immediately via SMS and AgentMail flag",
    };
  }

  // Reschedule detection
  if (
    combined.includes("reschedule") ||
    combined.includes("different time") ||
    combined.includes("move my appointment") ||
    combined.includes("change time") ||
    combined.includes("postpone") ||
    combined.includes("later date")
  ) {
    return {
      intent: "reschedule",
      confidence: 0.92,
      requiresHumanEscalation: false,
      recommendedAction: "Check calendar availability with travel buffers and propose alternative soft holds",
    };
  }

  // General inquiry default
  return {
    intent: "general_inquiry",
    confidence: 0.85,
    requiresHumanEscalation: combined.includes("quote") || combined.includes("price"),
    recommendedAction: "Generate automated AI draft response for customer inquiry",
  };
}
