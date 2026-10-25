import { createHash } from "node:crypto";
import { AppError } from "./api-error";
import {
  minimumMonthlyCapUsd,
  USAGE_DEFAULT_MONTHLY_CAP_USD,
  type UsageTierId,
} from "./usage-billing-catalog";

/** A retry may resume only the exact purchase whose durable operation it owns. */
export function checkoutConfigurationKey(
  planId: string,
  interval: "month" | "year",
  items: ReadonlyArray<{ price?: string; quantity?: number }>,
): string {
  const lines = items
    .map(({ price, quantity }) => [price, quantity ?? null])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash("sha256").update(JSON.stringify({ planId, interval, lines })).digest("hex");
}

/** Checkout starts with the disclosed default cap; fixed charges must fit it. */
export function validateUsageCheckoutAddons(
  addons: {
    numbers: number;
    emailAddresses: number;
  },
  tier: UsageTierId = "starter",
): void {
  if (minimumMonthlyCapUsd(addons, tier) > USAGE_DEFAULT_MONTHLY_CAP_USD) {
    throw new AppError(
      400,
      "USAGE_ADDONS_EXCEED_CAP",
      "These add-ons exceed the default monthly limit. Choose fewer add-ons or contact support.",
    );
  }
}
