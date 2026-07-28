import type { ToolCallResult } from "../routes/vapi/types";

const UNVERIFIED_SUCCESS_PHRASES = [
  /\bi(?:'|’)ve queued\b/i,
  /\bi(?:'|’)ve noted\b/i,
  /\bi(?:'|’)ll make sure\b/i,
  /\bit should (?:arrive|go out) shortly\b/i,
  /\bbut i(?:'|’)ve noted your request\b/i,
  /\blet me note (?:your address|that)\b/i,
] as const;

const ACTION_LABELS: Readonly<Record<string, string>> = {
  create_followup_task: "follow-up task",
  send_email: "email",
  send_text_message: "message",
  lookup_phone_number: "phone lookup",
};

/**
 * Older handlers sometimes returned comforting language after an exception even
 * though no durable task, queue, or external action was confirmed. Never allow
 * those phrases to reach the live model as apparent success.
 */
export function enforceAgentToolResultTruth(
  toolName: string,
  output: ToolCallResult,
): ToolCallResult {
  const result = String(output.result || "").trim();
  if (!UNVERIFIED_SUCCESS_PHRASES.some((pattern) => pattern.test(result))) {
    return { ...output, result };
  }

  const action = ACTION_LABELS[toolName] || "action";
  return {
    ...output,
    result: `The ${action} was not confirmed. Do not say it was sent, queued, saved, scheduled, or noted. Tell the caller it did not complete and offer a safe manual follow-up.`,
  };
}
