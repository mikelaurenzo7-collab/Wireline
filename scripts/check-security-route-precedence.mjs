#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const registry = read("src/server/register-api-routes.ts");

const precedence = [
  ["app.use(authOAuthExchangeAtomicRouter)", "app.use(authOAuthBrowserBindingRouter)"],
  ["app.use(authSessionHardeningRouter)", "app.use(authRouter)"],
  ["app.use(launchBillingCheckoutAtomicRouter)", "app.use(launchBillingCheckoutRouter)"],
  ["app.use(\"/api/webhooks\", webhookTestRouter)", "app.use(\"/api/webhooks\", webhookRouter)"],
  ["app.use(outboundDialAtomicRouter)", "app.use(outboundRouter)"],
];

const failures = [];
for (const [owner, legacy] of precedence) {
  const ownerIndex = registry.indexOf(owner);
  const legacyIndex = registry.indexOf(legacy);
  if (ownerIndex === -1 || legacyIndex === -1 || ownerIndex >= legacyIndex) {
    failures.push(`Expected ${owner} before ${legacy}`);
  }
}

const contracts = [
  {
    file: "src/routes/auth-session-hardening-routes.ts",
    required: [
      '"/api/auth/refresh"',
      "authenticateUser",
      '"/api/auth/session"',
      "sessionRevokedBefore",
      '"/api/auth/signout"',
    ],
  },
  {
    file: "src/routes/auth-oauth-exchange-atomic-routes.ts",
    required: [
      '"/api/auth/oauth/exchange"',
      "bridge_state_hash =",
      "DELETE FROM wireline_oauth_pending_codes",
      "expires_at > clock_timestamp()",
    ],
  },
  {
    file: "src/routes/outbound-dial-atomic-routes.ts",
    required: [
      '"/api/outbound/dial"',
      "outboundDialReservations",
      ".onConflictDoNothing()",
      "wireline_dial_operation_id",
      "provider_outcome_ambiguous",
      "post_provider_persistence_failed",
    ],
  },
  {
    file: "src/routes/launch-billing-checkout-atomic-routes.ts",
    required: [
      '"/api/billing/checkout"',
      "checkoutOperations",
      "idempotencyKey: `wireline-customer-",
      "idempotencyKey: `wireline-checkout-",
      "stripe_checkout_outcome_unknown",
      "post_stripe_persistence_failed",
    ],
  },
  {
    file: "src/routes/webhook-test-routes.ts",
    required: ["webhookId: hook.id", "attemptWebhookDelivery", "lastStatusCode"],
  },
  {
    file: "src/routes/team-routes.ts",
    required: [
      '"/api/team/invitations/accept"',
      "invitation_token_hash = NULL",
      "lower(email) = lower(",
      '"/api/team/workspaces/:tenantId/select"',
    ],
  },
];

for (const contract of contracts) {
  const source = read(contract.file);
  for (const required of contract.required) {
    if (!source.includes(required)) failures.push(`${contract.file} is missing ${required}`);
  }
}

function requireRouteMiddleware(file, routePath, middleware) {
  const source = read(file);
  const pathIndex = source.indexOf(`"${routePath}"`);
  if (pathIndex === -1) {
    failures.push(`Missing expected auth route ${routePath} in ${file}`);
    return;
  }
  const routeWindow = source.slice(pathIndex, pathIndex + 1200);
  if (!routeWindow.includes(middleware)) {
    failures.push(
      `${routePath} must include ${middleware}; the /api/auth namespace contains public routes and cannot be trusted as an allowlist`,
    );
  }
}

// The authorization matrix deliberately contains public auth endpoints, but
// these routes mutate tenant state or mint a new session and must remain
// independently default-denied. This guard catches middleware removal even if
// the broad namespace classifier would otherwise label the route public.
for (const sensitivePath of [
  "/api/auth/signup-intent",
  "/api/auth/resend-verification",
  "/api/auth/bootstrap",
]) {
  requireRouteMiddleware("src/routes/auth-routes.ts", sensitivePath, "authenticateUser");
}
requireRouteMiddleware(
  "src/routes/auth-session-hardening-routes.ts",
  "/api/auth/refresh",
  "authenticateUser",
);

if (failures.length) {
  console.error("Security route precedence contract failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Security route precedence contract passed.");
