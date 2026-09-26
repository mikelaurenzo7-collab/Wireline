/** Keep missing or malformed provider values distinct from an empty balance. */
export function readTwilioPrepaidBalanceUsd(payload) {
  if (typeof payload?.currency !== "string" || payload.currency.toUpperCase() !== "USD") {
    return null;
  }
  const value = payload.balance;
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^-?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const balance = Number(value);
  return Number.isFinite(balance) ? balance : null;
}

/** Funding follows actual usage; there is no fixed launch reserve requirement. */
export function twilioFundingBlocker(balance) {
  if (typeof balance !== "number" || !Number.isFinite(balance)) {
    return "twilio_prepaid_balance_unknown";
  }
  return balance > 0 ? null : "twilio_prepaid_balance_not_positive";
}
