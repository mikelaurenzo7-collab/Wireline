export type VapiHandoffTriggerEvaluation = {
  hasTriggerWord: boolean;
  lowConfidence: boolean;
  reason: "Explicit Caller Handoff Request" | "Very Low Transcription Confidence (< 45%)";
};

const EXPLICIT_HANDOFF_PATTERNS = [
  /\b(?:speak|talk|connect|transfer)(?: me)? to (?:a |an |the )?(?:human|real person|representative|agent|supervisor|manager)\b/i,
  /\b(?:get|put) (?:me )?(?:a |an |the )?(?:human|real person|representative|supervisor|manager)\b/i,
  /\b(?:i want|i need|let me speak with) (?:a |an |the )?(?:human|real person|representative|supervisor|manager)\b/i,
  /\b(?:human representative|human agent|real person|live person|supervisor|manager)\b/i,
  /\bescalate (?:this|the call|me|my issue|my case)\b/i,
  /\b(?:this is|it is|it's) (?:an )?(?:emergency|urgent matter)\b/i,
  /\bi need (?:urgent|immediate) help\b/i,
] as const;

function normalizedWords(transcriptText: string): string[] {
  return String(transcriptText || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Detect genuine caller requests for a human without confusing business verbs
 * such as "cancel my order" or "cancel my appointment" with an escalation.
 * Transcription confidence is only a fallback for substantial, severely
 * uncertain utterances; ordinary ASR variation must not page a human.
 */
export function evaluateVapiHandoffTriggers(
  transcriptText: string,
  confidence: number,
): VapiHandoffTriggerEvaluation {
  const normalized = String(transcriptText || "").trim().toLowerCase();
  const words = normalizedWords(normalized);
  const hasTriggerWord = EXPLICIT_HANDOFF_PATTERNS.some((pattern) => pattern.test(normalized));
  const lowConfidence =
    !hasTriggerWord && Number.isFinite(confidence) && confidence < 0.45 && words.length >= 3;

  return {
    hasTriggerWord,
    lowConfidence,
    reason: hasTriggerWord
      ? "Explicit Caller Handoff Request"
      : "Very Low Transcription Confidence (< 45%)",
  };
}
