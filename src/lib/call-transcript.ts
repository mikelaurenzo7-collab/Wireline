export type CallTranscriptSpeaker = "customer" | "assistant" | "system";

export type CallTranscriptLine = {
  id: string;
  speaker: CallTranscriptSpeaker;
  label: string;
  body: string;
};

const CUSTOMER_LABELS = new Set([
  "user",
  "human",
  "caller",
  "customer",
  "client",
  "prospect",
  "lead",
]);

const SYSTEM_LABELS = new Set(["system", "account holder"]);

/**
 * Converts provider transcript text into explicit conversational turns.
 * Unknown named speakers are intentionally treated as assistant turns so a
 * configured assistant name remains visible instead of degrading to "System".
 */
export function parseCallTranscript(transcript: string): CallTranscriptLine[] {
  return transcript
    .split("\n")
    .map((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return null;

      const match = line.match(/^([A-Z][A-Za-z\s_-]{0,30}):\s*(.*)$/);
      const rawSpeaker = match?.[1]?.trim() ?? "";
      const body = match?.[2]?.trim() || line;
      const normalizedSpeaker = rawSpeaker.toLowerCase();
      const speaker: CallTranscriptSpeaker = !rawSpeaker
        ? "system"
        : CUSTOMER_LABELS.has(normalizedSpeaker)
          ? "customer"
          : SYSTEM_LABELS.has(normalizedSpeaker)
            ? "system"
            : "assistant";

      return {
        id: `${index}-${rawSpeaker || "system"}-${body.slice(0, 24)}`,
        speaker,
        label: !rawSpeaker
          ? "Transcript"
          : speaker === "customer"
            ? "Caller"
            : speaker === "system"
              ? "System"
              : rawSpeaker,
        body,
      };
    })
    .filter((line): line is CallTranscriptLine => Boolean(line));
}
