import { readFileSync } from "node:fs";
import { CANONICAL_PRODUCTION_URL } from "./production-url.mjs";
import { getHandledStripeWebhookEvents } from "./stripe-handled-events.mjs";

// Plain-Node operator commands read the runtime authority without introducing
// another API-version catalog or loading the application and its credentials.
export function getPinnedStripeApiVersion() {
  const source = readFileSync(
    new URL("../../src/lib/stripe-api-version.ts", import.meta.url),
    "utf8",
  );
  const matches = [
    ...source.matchAll(
      /^export const STRIPE_API_VERSION(?:\s*:\s*Stripe\.LatestApiVersion)?\s*=\s*"([^"]+)";\s*$/gm,
    ),
  ];
  if (matches.length !== 1 || !/^\d{4}-\d{2}-\d{2}\.[a-z]+$/.test(matches[0][1])) {
    throw new Error(
      "Cannot read the canonical runtime Stripe API version; refusing readiness certification.",
    );
  }
  return matches[0][1];
}

/** Complete, enabled, live canonical inventory with the runtime payload version. */
export function evaluateStripeWebhookReadiness(
  result,
  expectedEvents = getHandledStripeWebhookEvents(),
  expectedApiVersion = getPinnedStripeApiVersion(),
) {
  const inventory = Array.isArray(result?.body?.data) ? result.body.data : [];
  const canonicalEndpoints = inventory.filter(
    (endpoint) =>
      endpoint?.status === "enabled" &&
      String(endpoint?.url || "").replace(/\/+$/, "") ===
        `${CANONICAL_PRODUCTION_URL}/api/stripe-webhook`,
  );
  const endpoint = canonicalEndpoints.length === 1 ? canonicalEndpoints[0] : null;
  const enabledEvents = Array.isArray(endpoint?.enabled_events)
    ? [...endpoint.enabled_events].sort()
    : [];
  const missingEvents = expectedEvents.filter((event) => !enabledEvents.includes(event));
  const extraEvents = enabledEvents.filter(
    (event) => event !== "*" && !expectedEvents.includes(event),
  );
  const identityFindings = [];
  if (result?.ok !== true) identityFindings.push("webhook_inventory_unreachable");
  if (result?.body?.has_more === true) identityFindings.push("webhook_inventory_truncated");
  else if (result?.body?.has_more !== false)
    identityFindings.push("webhook_inventory_completeness_unknown");
  if (canonicalEndpoints.length !== 1)
    identityFindings.push(`canonical_endpoint_count_${canonicalEndpoints.length}`);
  if (endpoint && endpoint.livemode !== true) identityFindings.push("endpoint_not_livemode");
  if (endpoint && endpoint.api_version !== expectedApiVersion)
    identityFindings.push("endpoint_api_version_mismatch");
  const findings = [...identityFindings];
  if (!expectedEvents.length) findings.push("handled_event_inventory_empty");
  if (missingEvents.length) findings.push("handled_events_missing");
  if (extraEvents.length) findings.push("unhandled_events_enabled");
  return {
    endpoint,
    canonicalEndpointCount: canonicalEndpoints.length,
    expectedApiVersion,
    missingEvents,
    extraEvents,
    identityFindings,
    findings,
    ready: Boolean(endpoint && findings.length === 0),
  };
}
