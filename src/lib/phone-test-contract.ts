/** Shared, credential-free receipt for one owner-requested phone test. */
export const PHONE_TEST_STATUSES = [
  "creating",
  "ringing",
  "verifying",
  "connected",
  "ending",
  "completed",
  "failed",
  "uncertain",
  "cancelled",
] as const;
export type PhoneTestStatus = (typeof PHONE_TEST_STATUSES)[number];
export type PhoneTestReceipt = {
  id: string;
  agent_id: string;
  status: PhoneTestStatus;
  expires_at: string;
  verification_code?: string;
  phone_last4?: string;
  error?: string;
};

export function phoneTestIsTerminal(status: PhoneTestStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function readPhoneTestReceipt(
  value: unknown,
  requestKey: string,
  agentId: string,
): PhoneTestReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!body.test || typeof body.test !== "object" || Array.isArray(body.test)) return null;
  const row = body.test as Record<string, unknown>;
  if (
    row.id !== requestKey ||
    row.agent_id !== agentId ||
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestKey) ||
    !PHONE_TEST_STATUSES.includes(row.status as PhoneTestStatus) ||
    typeof row.expires_at !== "string" ||
    !Number.isFinite(Date.parse(row.expires_at)) ||
    (row.verification_code !== undefined &&
      (typeof row.verification_code !== "string" || !/^\d{6}$/.test(row.verification_code))) ||
    (row.phone_last4 !== undefined &&
      (typeof row.phone_last4 !== "string" || !/^\d{4}$/.test(row.phone_last4))) ||
    (row.error !== undefined && (typeof row.error !== "string" || row.error.length > 500))
  )
    return null;
  const status = row.status as PhoneTestStatus;
  if (["ringing", "verifying"].includes(status) && !row.verification_code) return null;
  return {
    id: requestKey,
    agent_id: agentId,
    status,
    expires_at: row.expires_at,
    // A code is useful only before possession has been confirmed.
    ...(["creating", "ringing", "verifying"].includes(status) && row.verification_code
      ? { verification_code: row.verification_code as string }
      : {}),
    ...(row.phone_last4 ? { phone_last4: row.phone_last4 as string } : {}),
    ...(row.error ? { error: row.error as string } : {}),
  };
}
