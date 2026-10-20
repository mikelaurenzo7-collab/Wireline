/**
 * Annual channel plans invoice once a year. Runtime Allowance still resets
 * every month and does not roll over, so each Stripe year is posted as up to
 * twelve idempotent monthly slices instead of one twelve-month lump.
 */

function addUtcMonths(anchor: Date, months: number): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + months;
  const day = Math.min(anchor.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
    ),
  );
}

/** `sub_...:periodStart` from the Stripe subscription period. Slice refs are not valid input. */
export function annualAllowanceSliceReference(
  billingPeriodReference: string,
  now = new Date(),
): string | null {
  const separator = billingPeriodReference.lastIndexOf(":");
  if (separator <= 0) return null;
  const startSec = Number(billingPeriodReference.slice(separator + 1));
  if (!Number.isInteger(startSec) || startSec <= 0) return null;
  const start = new Date(startSec * 1000);
  if (Number.isNaN(start.getTime())) return null;
  const end = addUtcMonths(start, 12);
  if (now < start || now >= end) return null;
  let sliceStart = start;
  for (let month = 0; month < 12; month++) {
    const next = addUtcMonths(start, month + 1);
    const bounded = next.getTime() > end.getTime() ? end : next;
    if (now < bounded) {
      return `${billingPeriodReference}:slice:${Math.floor(sliceStart.getTime() / 1000)}`;
    }
    sliceStart = bounded;
  }
  return null;
}
