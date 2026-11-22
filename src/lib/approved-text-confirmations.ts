/** Confirmations the owner checked. A model payload cannot supply these. */
export type TextSendConfirmations = {
  permissionConfirmed?: boolean;
  nonsalesConfirmed?: boolean;
  salesAttestationConfirmed?: boolean;
  actorIp?: string | null;
  userAgent?: string | null;
};

/** Read only the three owner checkboxes. A purpose field in the body is ignored. */
export function textConfirmationsFromBody(
  body: unknown,
  actor?: { ip?: string | null; userAgent?: string | null },
): TextSendConfirmations {
  const record =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const checked = (camel: string, snake: string) => record[camel] === true || record[snake] === true;
  return {
    permissionConfirmed: checked("permissionConfirmed", "permission_confirmed"),
    nonsalesConfirmed: checked("nonsalesConfirmed", "nonsales_confirmed"),
    salesAttestationConfirmed: checked("salesAttestationConfirmed", "sales_attestation_confirmed"),
    actorIp: actor?.ip ?? null,
    userAgent: actor?.userAgent ?? null,
  };
}

/** Stored call ids may be the raw carrier id or the openai: prefix. */
export function recordedCallIds(sourceId: string): string[] {
  const id = sourceId.trim();
  if (!id) return [];
  const raw = id.startsWith("openai:") ? id.slice("openai:".length) : id;
  const prefixed = raw ? `openai:${raw}` : id;
  return [...new Set([id, raw, prefixed].filter((value) => value.length > 0))];
}

/** Match twilio-service cleanPhone so gate and lead lookup use the same destination. */
export function cleanOutboundSmsPhone(raw: string | null | undefined): string {
  const input = String(raw || "").replace(/^whatsapp:/i, "");
  const cleaned = input.replace(/[^0-9+]/g, "");
  if (!cleaned) return "";
  return cleaned.startsWith("+") ? `+${cleaned.slice(1).replace(/\+/g, "")}` : cleaned;
}
