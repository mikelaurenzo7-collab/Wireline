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

/**
 * The personality as a prompt may carry it: the owner's chosen delivery tone
 * first, then as much of the rest as fits.
 *
 * The tone stanza is written at the end of the document, after a role text of
 * about 3,200 characters on a new Bot, and every prompt keeps only the first
 * 1,500. So the one part of this document an owner chooses in Set Up was the
 * part that never reached a call or a text.
 */
export function personalityForPrompt(personality: string | null | undefined, max: number): string {
  const raw = (personality || "").trim();
  if (!raw || max <= 0) return "";
  // The stanza runs to the next heading, as it does where it is written
  // (`replaceDeliveryTone`). Anything typed under the tone line with no
  // heading of its own is part of it, and is carried, not dropped.
  const toneSection =
    /(^|\r?\n)## DELIVERY TONE[\t ]*\r?\n([\s\S]*?)(?=\r?\n[\t ]{0,3}#{1,6}[\t ]+\S|$)/gi;
  const stanza = (new RegExp(toneSection.source, "i").exec(raw)?.[2] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const rest = stanza
    ? raw
        .replace(toneSection, "$1")
        .replace(/(?:\r?\n){3,}/g, "\n\n")
        .trim()
    : raw;
  if (!stanza) return rest.slice(0, max);
  const lead = `Delivery tone: ${stanza}`.slice(0, max);
  const room = max - lead.length - 2;
  return room > 0 && rest ? `${lead}\n\n${rest.slice(0, room).trimEnd()}` : lead;
}

export function composeSetupPersonality(
  existingPersonality: string | null | undefined,
  toneLabel: string,
): string {
  return replaceDeliveryTone(existingPersonality, `${toneLabel}. Concise, useful, and discreet.`);
}

export function replaceDeliveryTone(
  existingPersonality: string | null | undefined,
  tone: string,
): string {
  const toneLine = tone.replace(/\s+/g, " ").trim();
  const existing = (existingPersonality || "").trim();
  if (!existing) return `${DELIVERY_TONE_MARKER}\n${toneLine}`;
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
 * table. Older Studio saves used a single unmarked line for the first tone.
 * Only recognize that saved format when there is no delivery tone stanza.
 */
export function resolveDeliveryToneLabel(personality?: string | null): string {
  const raw = personality?.trim() ?? "";
  if (!new RegExp(`(?:^|\n)${DELIVERY_TONE_MARKER}`, "i").test(raw)) {
    const legacyTone = raw.match(/^([a-z ]+)\. Concise, useful, and discreet\.$/i)?.[1];
    const key = legacyTone?.toLowerCase() ?? "";
    return Object.hasOwn(KNOWN_TONE_LABELS, key) ? KNOWN_TONE_LABELS[key] : "Not set";
  }
  const value = readSetupDeliveryTone(raw);
  const sentence = value.split(/[.\n]/)[0]?.trim() ?? "";
  if (!sentence) return "Not set";
  const normalized = sentence.toLowerCase().replace(/[\s_-]+/g, " ");
  return (
    KNOWN_TONE_LABELS[normalized] ??
    (sentence.length > 80 ? `${sentence.slice(0, 77).trimEnd()}…` : sentence)
  );
}
