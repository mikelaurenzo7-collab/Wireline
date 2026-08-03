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
    ],
  },
  {
    file: "src/routes/launch-billing-checkout-atomic-routes.ts",
    required: [
      '"/api/billing/checkout"',
      "checkoutOperations",
      "idempotencyKey: `wireline-customer-",
      "idempotencyKey: `wireline-checkout-",
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

const authSource = read("src/routes/auth-routes.ts");
for (const sensitivePath of ["/api/auth/signup-intent", "/api/auth/resend-verification"]) {
  const pathIndex = authSource.indexOf(`"${sensitivePath}"`);
  if (pathIndex === -1) {
    failures.push(`Missing expected auth route ${sensitivePath}`);
    continue;
  }
  const routeWindow = authSource.slice(pathIndex, pathIndex + 900);
  if (!routeWindow.includes("authenticateUser")) {
    failures.push(`${sensitivePath} must remain authenticated even though /api/auth has public routes`);
  }
}

if (failures.length) {
  console.error("Security route precedence contract failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Security route precedence contract passed.");
