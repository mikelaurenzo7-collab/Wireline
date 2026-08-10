import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The Stripe events this server actually handles, read off the code that
 * handles them.
 *
 * Two scripts need this list and they used to answer differently. The aligner
 * derived it from source; the launch-status gate carried its own hardcoded
 * eight. When `charge.dispute.funds_withdrawn` and
 * `charge.dispute.funds_reinstated` were implemented in the preflight, only the
 * aligner learned about them — so a correctly configured endpoint was reported
 * as carrying two "extra" events, and `stripe_webhook_not_aligned` sat on the
 * launch report as a permanent false blocker.
 *
 * That is worse than noise. The obvious way to clear it is to delete the two
 * "extra" events from Stripe, which would silently stop the dispute handlers in
 * `stripe-runtime-allowance-retry.ts` from ever being invoked — the ones that
 * debit and credit tenant allowance when dispute funds move. A stale gate that
 * tells you to break production accounting is a gate worth deleting; this makes
 * both callers read the same source instead.
 */
const OWNERS = [
  "src/routes/billing-routes.ts",
  "src/middleware/stripe-runtime-allowance-retry.ts",
];

function extractHandledEvents(source) {
  return [
    ...source.matchAll(/(?:case\s+|event(?:Type|\.type)\s*===\s*)"([a-z_]+(?:\.[a-z_]+)+)"/g),
  ].map((match) => match[1]);
}

/** Sorted, de-duplicated event names handled by the canonical billing owners. */
export function getHandledStripeWebhookEvents() {
  const events = new Set();
  for (const owner of OWNERS) {
    for (const event of extractHandledEvents(readFileSync(join(ROOT, owner), "utf8"))) {
      events.add(event);
    }
  }
  return [...events].sort();
}

export { OWNERS as STRIPE_WEBHOOK_EVENT_OWNERS };
