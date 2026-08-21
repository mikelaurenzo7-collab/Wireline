import { randomBytes } from "node:crypto";

const LEGACY_BRIDGE_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERSIONED_BRIDGE_CODE_PATTERN = /^[nr][A-Za-z0-9_-]{43}$/;

/**
 * Prefix new bridge codes with an authenticated account-resolution result.
 * The full code is still matched by its server-side HMAC before consumption,
 * so the prefix cannot be changed without invalidating the one-time code.
 * Legacy 43-character codes remain valid during rolling deployments and are
 * conservatively treated as returning-user sign-ins.
 */
export function createOAuthBridgeCode(isNewUser: boolean): string {
  return `${isNewUser ? "n" : "r"}${randomBytes(32).toString("base64url")}`;
}

export function isOAuthBridgeCode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (LEGACY_BRIDGE_CODE_PATTERN.test(value) || VERSIONED_BRIDGE_CODE_PATTERN.test(value))
  );
}

export function isNewUserOAuthBridgeCode(value: string): boolean {
  return VERSIONED_BRIDGE_CODE_PATTERN.test(value) && value.startsWith("n");
}
