const CALLABLE_CODES = new Set(["C", "E", "G", "H", "O", "W", "X", "Y"]);
const BLOCKED_CODES = new Set(["D", "P", "B", "I", "M", "L", "F", "V"]);

/**
 * Interpret the single-number DNCScrub v5 response for both runtime and probes.
 * Unknown/malformed results block dialing and cannot certify vendor readiness.
 * @param {unknown} payload
 * @returns {{ recognized: boolean, listed: boolean }}
 */
export function parseDncScrubResult(payload) {
  if (!Array.isArray(payload) || payload.length !== 1) {
    return { recognized: false, listed: true };
  }
  const row = payload[0];
  const rawCode = row?.ResultCode ?? row?.resultCode;
  if (typeof rawCode !== "string") return { recognized: false, listed: true };
  const code = rawCode.trim().toUpperCase();
  if (CALLABLE_CODES.has(code)) return { recognized: true, listed: false };
  return { recognized: BLOCKED_CODES.has(code), listed: true };
}
