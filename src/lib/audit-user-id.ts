const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuditMetadata = Record<string, unknown>;

export function isAuditUuid(value: string | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function normalizeAuditUserIdForRecord(
  userId: string | undefined,
  metadata: AuditMetadata | undefined,
): { userId?: string; metadata?: AuditMetadata; droppedUserId?: string } {
  if (!userId) return { userId: undefined, metadata };
  if (isAuditUuid(userId)) return { userId, metadata };

  return {
    userId: undefined,
    metadata: {
      ...metadata,
      invalid_user_id: userId,
      invalid_user_id_reason: "non_uuid",
    },
    droppedUserId: userId,
  };
}
