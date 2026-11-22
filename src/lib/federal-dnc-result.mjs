const CALLABLE_CODES = new Set(["C", "E", "G", "W", "X", "Y"]);
// A vendor relationship override (H or O) still represents a screened number
// on a DNC list. Relationship status does not clear an AI sales call or text.
const BLOCKED_CODES = new Set(["D", "P", "B", "I", "M", "L", "F", "V", "H", "O"]);

/**
 * Interpret the single-number DNCScrub v5 response for both runtime and probes.
 * Unknown/malformed results block dialing and cannot certify vendor readiness.
 * @param {unknown} payload
 * @param {string} expectedPhone National number sent in the request.
 * @returns {{ recognized: boolean, listed: boolean }}
 */
export function parseDncScrubResult(payload, expectedPhone) {
  if (!Array.isArray(payload) || payload.length !== 1) {
    return { recognized: false, listed: true };
  }
  const row = payload[0];
  const phone = row?.Phone ?? row?.phone;
  if (typeof phone !== "string" || phone.trim() !== expectedPhone) {
    return { recognized: false, listed: true };
  }
  const rawCode = row?.ResultCode ?? row?.resultCode;
  if (typeof rawCode !== "string") return { recognized: false, listed: true };
  const code = rawCode.trim().toUpperCase();
  if (CALLABLE_CODES.has(code)) return { recognized: true, listed: false };
  return { recognized: BLOCKED_CODES.has(code), listed: true };
}
