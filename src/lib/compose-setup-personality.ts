/**
 * Studio Set up used to replace the whole personality blob with a one-line
 * tone stub ("Warm. Concise, useful…"), which wiped role + template depth —
 * especially painful for personal agents seeded with the concierge overlay.
 * Tone chips now only refresh the delivery-tone stanza.
 */
export const DELIVERY_TONE_MARKER = "## DELIVERY TONE";

/** Saved delivery tone takes precedence over tone words in the role playbook. */
export function readSetupDeliveryTone(personality?: string | null): string {
  const value = personality?.trim() || "";
  return value.match(/(?:^|\n)## DELIVERY TONE\s*\n([^\n]+)/i)?.[1]?.trim() || value;
}

export function composeSetupPersonality(
  existingPersonality: string | null | undefined,
  toneLabel: string,
  _isBusinessAgent: boolean,
): string {
  const toneLine = `${toneLabel}. Concise, useful, and discreet.`;
  const existing = (existingPersonality || "").trim();
  if (!existing) return toneLine;
  // A tone stanza can appear before customer instructions or template policy.
  // Replace only its body; treating the rest of the document as tone erases
  // unrelated guidance and can remove a regulated template's review marker.
  const toneSection =
    /(^|\r?\n)## DELIVERY TONE[\t ]*\r?\n[\s\S]*?(?=\r?\n[\t ]{0,3}#{1,6}[\t ]+\S|$)/gi;
  let replaced = false;
  const updated = existing.replace(toneSection, (_section, prefix: string) => {
    replaced = true;
    return `${prefix}${DELIVERY_TONE_MARKER}\n${toneLine}\n`;
  });
  return replaced ? updated.trimEnd() : `${existing}\n\n${DELIVERY_TONE_MARKER}\n${toneLine}`;
}
