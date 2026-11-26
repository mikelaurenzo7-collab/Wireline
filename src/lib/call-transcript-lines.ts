/**
 * Stored call transcripts are one "Agent: …" or "Caller: …" line per turn.
 * Kept free of imports so the live call session and the post-call digest
 * read caller speech the same way.
 */

/** What the caller said, without the Bot's own disclosure, greeting or replies. */
export function callerTurnsText(transcript: string | null | undefined): string {
  return (transcript || "")
    .split("\n")
    .filter((line) => line.startsWith("Caller: "))
    .map((line) => line.slice("Caller: ".length).trim())
    .filter(Boolean)
    .join("\n");
}
