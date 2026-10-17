export type HumanHandoffValues = {
  phone: string;
  email: string;
  transfer: boolean;
  keywords: string;
};

export type HumanHandoffDraft = {
  saved: HumanHandoffValues | null;
  values: HumanHandoffValues | null;
  saving: boolean;
  error?: string | null;
  listeners?: Set<() => void>;
};

/** A complete number, never an embedded number or an extension silently discarded. */
export function normalizeHandoffPhone(value: string): string | null {
  const raw = value.trim();
  if (!raw || !/^[+\d\s().-]+$/.test(raw)) return null;
  const compact = raw.replace(/[\s().-]/g, "");
  const international = /^\d{10}$/.test(compact)
    ? `+1${compact}`
    : /^1\d{10}$/.test(compact)
      ? `+${compact}`
      : compact;
  return /^\+[1-9]\d{7,14}$/.test(international) ? international : null;
}

export function handoffKeywords(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function humanHandoffProblem(
  values: HumanHandoffValues,
  botPhones: readonly string[] = [],
): string | null {
  const phone = normalizeHandoffPhone(values.phone);
  if (values.phone.trim() && !phone) return "Enter a complete phone number with its country code.";
  if (values.transfer && !phone) return "Add a phone number before turning on live transfers.";
  if (phone && botPhones.some((line) => normalizeHandoffPhone(line) === phone))
    return "Use a person's phone number, not this Bot's own line.";
  if (values.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim()))
    return "Enter a valid notification email.";
  const keywords = handoffKeywords(values.keywords);
  if (keywords.length > 24 || keywords.some((keyword) => keyword.length > 120))
    return "Use up to 24 triggers, each 120 characters or less.";
  return null;
}

/** Missing or malformed receipts never turn saved routing off in the editor. */
export function readHumanHandoffProfile(value: unknown): HumanHandoffValues | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Record<string, unknown>;
  if (
    !(typeof profile.escalation_phone === "string" || profile.escalation_phone === null) ||
    !(typeof profile.escalation_email === "string" || profile.escalation_email === null) ||
    typeof profile.escalation_handoff_enabled !== "boolean" ||
    !Array.isArray(profile.escalation_keywords) ||
    !profile.escalation_keywords.every((keyword) => typeof keyword === "string") ||
    (profile.transfer_phone !== undefined &&
      profile.transfer_phone !== null &&
      typeof profile.transfer_phone !== "string")
  )
    return null;
  return {
    phone: (profile.escalation_phone || profile.transfer_phone || "") as string,
    email: profile.escalation_email || "",
    transfer: profile.escalation_handoff_enabled,
    keywords: profile.escalation_keywords.join("\n"),
  };
}

export function sameHumanHandoff(a: HumanHandoffValues | null, b: HumanHandoffValues | null) {
  return Boolean(
    a &&
    b &&
    a.phone === b.phone &&
    a.email === b.email &&
    a.transfer === b.transfer &&
    a.keywords === b.keywords,
  );
}
