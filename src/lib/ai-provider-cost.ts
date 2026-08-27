/**
 * Normalize provider-reported request charges for the audit ledger.
 *
 * `wireline_audit_log.cost_usd` is numeric(12, 6). Provider metadata crosses
 * an external trust boundary, so accept only ordinary unsigned decimal syntax
 * and quantize it before any accounting code sees it. This deliberately
 * rejects JavaScript coercions such as hex, exponent notation, Infinity, and
 * whitespace-padded values.
 */
export const PROVIDER_COST_USD_SCALE = 6;
export const PROVIDER_COST_USD_MAX = 999_999.999999;

const SCALE_FACTOR = 1_000_000n;
const MAX_SCALED_COST = 999_999_999_999n;
const MAX_DECIMAL_SOURCE_LENGTH = 64;
const CANONICAL_UNSIGNED_DECIMAL = /^(?:0|[1-9]\d*)(?:\.(\d+))?$/;

export function normalizeProviderReportedCostUsd(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (typeof value === "number" && !Number.isFinite(value)) return undefined;

  const source = typeof value === "number" ? String(value) : value;
  if (!source || source.length > MAX_DECIMAL_SOURCE_LENGTH) return undefined;

  const match = CANONICAL_UNSIGNED_DECIMAL.exec(source);
  if (!match) return undefined;

  const decimalIndex = source.indexOf(".");
  const whole = decimalIndex === -1 ? source : source.slice(0, decimalIndex);
  const fraction = match[1] ?? "";
  const quantizedFraction = fraction.slice(0, PROVIDER_COST_USD_SCALE).padEnd(6, "0");

  let scaled = BigInt(whole) * SCALE_FACTOR + BigInt(quantizedFraction);
  if (fraction.length > PROVIDER_COST_USD_SCALE && fraction[PROVIDER_COST_USD_SCALE] >= "5") {
    scaled += 1n;
  }
  if (scaled > MAX_SCALED_COST) return undefined;

  return Number(scaled) / Number(SCALE_FACTOR);
}
