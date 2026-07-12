const SECURITY_ONLY_TABLES = [
  "wireline_browser_handoffs",
  "wireline_email_verification_tokens",
  "wireline_mcp_access_tokens",
  "wireline_mcp_oauth_codes",
  "wireline_mcp_refresh_tokens",
  "wireline_oauth_pending_codes",
  "wireline_password_reset_tokens",
] as const;

/**
 * Ephemeral credentials are intentionally excluded from a downloadable account
 * archive. The export describes these omissions so the boundary is explicit,
 * while the account-deletion registry still guarantees that they are erased.
 */
export const ACCOUNT_EXPORT_SECURITY_ONLY_TABLES = new Set<string>(SECURITY_ONLY_TABLES);

export const ACCOUNT_EXPORT_REDACTED_FIELDS = [
  "access_token",
  "api_key",
  "authorization",
  "client_secret",
  "cookie",
  "key_hash",
  "password_hash",
  "private_key",
  "refresh_token",
  "secret",
  "secret_encrypted",
  "token_hash",
  "vapi_private_key",
] as const;

const EXACT_SENSITIVE_KEYS = new Set(
  ACCOUNT_EXPORT_REDACTED_FIELDS.map((field) => field.replace(/[^a-z0-9]/gi, "").toLowerCase()),
);

function normalizedFieldName(field: string): string {
  return field.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isSensitiveAccountExportField(field: string): boolean {
  const normalized = normalizedFieldName(field);
  if (EXACT_SENSITIVE_KEYS.has(normalized)) return true;

  return [
    "accesstoken",
    "apikey",
    "clientsecret",
    "keyhash",
    "passwordhash",
    "privatekey",
    "refreshtoken",
    "tokenhash",
  ].some((suffix) => normalized.endsWith(suffix));
}

/** Recursively removes usable credentials while preserving normal token-count metrics. */
export function redactAccountExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAccountExportValue);
  if (!value || typeof value !== "object" || value instanceof Date) return value;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  const redacted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveAccountExportField(key)) continue;
    redacted[key] = redactAccountExportValue(nestedValue);
  }
  return redacted;
}

export function accountExportKeyForTable(table: string): string {
  return table.replace(/^wireline_/, "");
}
