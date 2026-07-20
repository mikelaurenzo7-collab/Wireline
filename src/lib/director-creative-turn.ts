/**
 * Creative Director turn — logo / brand pack intents without LLM planner.
 */
import {
  checkCreativePolicy,
  isCreativeIntent,
  missingCreativeFields,
  parseCreativeBriefFromText,
} from "./director-logo-tools";
import type { DirectorApprovalMeta } from "./director-message-metadata";

export { isCreativeIntent };

export function buildCreativeDirectorTurn(
  operatorMessage: string,
  history: { role: "director" | "operator"; content: string }[],
): {
  reply: string;
  approvals: DirectorApprovalMeta[];
  clarifyingQuestions: string[];
} {
  const brief = parseCreativeBriefFromText(operatorMessage, history);
  const missing = missingCreativeFields(brief);
  const policy = checkCreativePolicy(String(brief.prompt || operatorMessage));

  if (!policy.allowed) {
    return {
      reply: policy.reason || "I can't process that creative request.",
      approvals: [],
      clarifyingQuestions: [],
    };
  }

  if (missing.length > 0) {
    const clarifyingQuestions = missing.map((m) =>
      m === "style"
        ? "What style direction should I follow?"
        : m === "colors"
          ? "What colors or palette should I use?"
          : "Where will this logo be used most (web, app icon, print, etc.)?",
    );
    return {
      reply: `Before I generate concepts, I need ${missing.join(", ")}. ${clarifyingQuestions.join(" ")}`,
      approvals: [],
      clarifyingQuestions,
    };
  }

  const callId = `director-call-${Date.now()}`;
  return {
    reply:
      "I drafted the execution plan: 3 logo concepts, then an exportable brand pack ZIP. Approve when you're ready.",
    approvals: [
      {
        callId,
        name: "generate_logo",
        label: "Generate 3 concepts",
        requiresApproval: true,
        input: brief as Record<string, unknown>,
      },
    ],
    clarifyingQuestions: [],
  };
}
