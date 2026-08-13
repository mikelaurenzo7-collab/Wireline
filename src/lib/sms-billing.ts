/**
 * SMS usage pricing — Runtime Balance at a fixed segment rate.
 *
 * Live SMS billing runs through `reserveRuntimeUsage` in twilio-service (a
 * prepaid reservation adjusted on delivery), which reads this rate. The
 * legacy post-hoc segment-debit helper that lived here was removed
 * 2026-08-13: it had no callers, and its swallow-and-return-0 error contract
 * contradicted the revenue-integrity rule the live path enforces.
 */

/** Customer-facing SMS rate (carrier cost plus operating margin). */
export const SMS_COST_PER_SEGMENT_USD = 0.02;
