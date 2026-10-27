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

const KNOWN_TONE_LABELS: Record<string, string> = {
  business: "Clear and professional",
  clear: "Clear and professional",
  professional: "Clear and professional",
  personal: "Warm and natural",
  warm: "Warm and natural",
  friendly: "Friendly and conversational",
  concise: "Concise and direct",
  playful: "Playful",
  authoritative: "Authoritative",
  polished: "Polished",
  energetic: "Energetic",
};

/**
 * The one delivery-tone derivation. Every surface (Studio Summary, Setup,
 * Knowledge) renders tone through this resolver: the label comes from the
 * saved DELIVERY TONE stanza's first segment, mapped through the known-tone
 * table. No stanza -> "Not set" — surfaces used to invent three different
 * answers here (a lookup, a random first sentence, a hardcoded fallback).
 * (Tone becomes a stored field with the schema pass; until then this
 * resolver is the single source the surfaces share.)
 */
export function resolveDeliveryToneLabel(personality?: string | null): string {
  const raw = personality ?? "";
  if (!new RegExp(`(?:^|\n)${DELIVERY_TONE_MARKER}`, "i").test(raw)) return "Not set";
  const value = readSetupDeliveryTone(raw);
  const sentence = value.split(/[.
]/)[0]?.trim() ?? "";
  if (!sentence) return "Not set";
  const normalized = sentence.toLowerCase().replace(/[\s_-]+/g, " ");
  return (
    KNOWN_TONE_LABELS[normalized] ??
    (sentence.length > 80 ? `${sentence.slice(0, 77).trimEnd()}…` : sentence)
  );
}
