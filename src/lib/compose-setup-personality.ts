/**
 * Studio Set up used to replace the whole personality blob with a one-line
 * tone stub ("Warm. Concise, useful…"), which wiped role + template depth —
 * especially painful for personal agents seeded with the concierge overlay.
 * Tone chips now only refresh the delivery-tone stanza.
 */
export const DELIVERY_TONE_MARKER = "## DELIVERY TONE";

export function composeSetupPersonality(
  existingPersonality: string | null | undefined,
  toneLabel: string,
  isBusinessAgent: boolean,
): string {
  const toneLine = isBusinessAgent
    ? `${toneLabel}. Concise, useful, and business-ready.`
    : `${toneLabel}. Concise, useful, and personally discreet.`;
  const existing = (existingPersonality || "").trim();
  if (!existing) return toneLine;
  const withoutOldTone = existing
    .replace(new RegExp(`\\n*${DELIVERY_TONE_MARKER}\\n[\\s\\S]*$`, "i"), "")
    .trimEnd();
  return `${withoutOldTone}\n\n${DELIVERY_TONE_MARKER}\n${toneLine}`;
}
