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
  ["app.use(sharedWorkspaceReadinessRouter)", "app.use(teamRouter)"],
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
      "tenantStore.run(payload.sub",
      "tenantStore.run(userId",
      '"/api/auth/signout"',
    ],
  },
  {
    file: "src/middleware/auth.ts",
    required: [
      "tenantStore.run(payload.sub",
      "tenantStore.run(userId",
      "sessionRevokedBefore",
    ],
  },
  {
    file: "src/routes/auth-oauth-exchange-atomic-routes.ts",
    required: [
      '"/api/auth/oauth/exchange"',
      "wireline_consume_oauth_pending_code",
      "tenantStore.run(entry.user_id",
      "oauthRateLimiter",
    ],
  },
  {
    file: "drizzle/migrations/0126_oauth_bridge_atomic_consume_function.sql",
    required: [
      "SECURITY DEFINER",
      "DELETE FROM public.wireline_oauth_pending_codes",
      "pending.code_hash = p_code_hash",
      "pending.bridge_state_hash = p_bridge_state_hash",
      "pending.expires_at > clock_timestamp()",
      "GRANT EXECUTE ON FUNCTION public.wireline_consume_oauth_pending_code",
    ],
  },
  {
    file: "src/lib/shared-workspace-readiness.ts",
    required: [
      'SHARED_WORKSPACE_CERTIFICATION = "shared-workspace-data-plane-v1"',
      "WIRELINE_SHARED_WORKSPACES_CERTIFICATION",
      "SHARED_WORKSPACES_NOT_CERTIFIED",
    ],
  },
  {
    file: "src/routes/shared-workspace-readiness-routes.ts",
    required: [
      'router.use("/api/team", authenticateUser, requireCertifiedSharedWorkspaces)',
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
      // Customer creation keys idempotency deterministically per user, with a
      // recovery variant when a prior customer id must be replaced. The key
      // is computed once and passed to every Stripe call in this flow.
      "`wireline-customer-${userId}`",
      "`wireline-customer-recovery-${userId}-${existingCustomerId}`",
      "{ idempotencyKey }",
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
      "wireline_accept_team_invitation",
      "tenantStore.run(req.user.id",
      "wireline_list_user_workspaces",
      '"/api/team/workspaces/:tenantId/select"',
    ],
  },
  {
    file: "drizzle/migrations/0124_team_invitation_claim_function.sql",
    required: [
      "SECURITY DEFINER",
      "wireline_current_user_id() IS DISTINCT FROM p_accepting_user_id",
      "invitation_token_hash = NULL",
      "lower(member.email) = lower(p_accepting_email)",
    ],
  },
  {
    file: "drizzle/migrations/0125_user_workspace_directory_function.sql",
    required: [
      "SECURITY DEFINER",
      "wireline_current_user_id() IS DISTINCT FROM p_user_id",
      "member.user_id = p_user_id",
      "member.revoked_at IS NULL",
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
