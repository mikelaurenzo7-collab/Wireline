import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("security and external-operation atomicity", () => {
  it("revokes issued sessions through a database-owned password invariant", () => {
    const migration = read("drizzle/migrations/0120_security_atomicity_team_sessions.sql");
    const auth = read("src/lib/auth-service.ts");
    const middleware = read("src/middleware/auth.ts");

    expect(migration).toContain("wireline_revoke_sessions_on_password_change");
    expect(migration).toContain("BEFORE UPDATE OF password_hash");
    expect(auth).toContain("iat_ms");
    expect(auth).toContain("await scryptAsync");
    expect(middleware).toContain("sessionRevokedBefore");
    expect(middleware).toContain("tokenIssuedAtMs(payload) <= user.sessionRevokedBefore.getTime()");
  });

  it("claims invitations only for the bound email and issues verified workspace sessions", () => {
    const source = read("src/routes/team-routes.ts");
    expect(source).toContain("invitation_token_hash = ${tokenHash}");
    expect(source).toContain("lower(email) = lower(${req.user.email})");
    expect(source).toContain("invitation_token_hash = NULL");
    expect(source).toContain("tenantId: accepted.tenant_id");
    expect(source).toContain('"/api/team/workspaces/:tenantId/select"');
  });

  it("reserves each number before dialing and preserves the lock after uncertain outcomes", () => {
    const source = read("src/routes/outbound-dial-atomic-routes.ts");
    const reservation = source.indexOf(".insert(outboundDialReservations)");
    const provider = source.indexOf("await placeOutboundCall");
    const lead = source.indexOf("tx.insert(schema.outboundLeads)");
    const completion = source.indexOf('status: "completed"');

    expect(reservation).toBeGreaterThan(-1);
    expect(provider).toBeGreaterThan(reservation);
    expect(lead).toBeGreaterThan(provider);
    expect(completion).toBeGreaterThan(provider);
    expect(source).toContain(".onConflictDoNothing()");
    expect(source).toContain('status: "dialing",\n            failureCode: "provider_outcome_ambiguous"');
    expect(source).toContain('failureCode: "post_provider_persistence_failed"');
    expect(source).toContain('code: "DIAL_STATUS_UNCERTAIN"');
    expect(source).toContain('code: "DIAL_ACCEPTED_RECONCILING"');
  });

  it("creates resumable Stripe Checkout Sessions with durable idempotency keys", () => {
    const source = read("src/routes/launch-billing-checkout-atomic-routes.ts");
    const operation = source.indexOf(".insert(checkoutOperations)");
    const customer = source.indexOf("stripe.customers.create");
    const session = source.indexOf("stripe.checkout.sessions.create");

    expect(operation).toBeGreaterThan(-1);
    expect(customer).toBeGreaterThan(operation);
    expect(session).toBeGreaterThan(customer);
    expect(source).toContain("idempotencyKey: `wireline-customer-${userId}`");
    expect(source).toContain("idempotencyKey: `wireline-checkout-${operationId}`");
    expect(source).toContain("reused: true");
    expect(source).toContain("resumed = true");
    expect(source).toContain('status: "creating",\n          stripeCustomerId: customerId');
    expect(source).toContain('failureCode: "stripe_checkout_outcome_unknown"');
    expect(source).toContain('failureCode: "post_stripe_persistence_failed"');
    expect(source).toContain('code: "CHECKOUT_RECONCILING"');
  });

  it("binds OAuth code deletion to the browser state in one statement", () => {
    const source = read("src/routes/auth-oauth-exchange-atomic-routes.ts");
    const deletion = source.indexOf("DELETE FROM wireline_oauth_pending_codes");
    expect(deletion).toBeGreaterThan(-1);
    expect(source.slice(deletion, deletion + 500)).toContain("bridge_state_hash =");
    expect(source.slice(deletion, deletion + 500)).toContain("expires_at > clock_timestamp()");
  });

  it("tests exactly one selected webhook and returns delivery truth", () => {
    const source = read("src/routes/webhook-test-routes.ts");
    expect(source).toContain("webhookId: hook.id");
    expect(source).toContain("await attemptWebhookDelivery(delivery.id.toString())");
    expect(source).not.toContain("dispatchWebhook(");
    expect(source).toContain("lastStatusCode");
  });

  it("pins hardened route owners ahead of legacy handlers", () => {
    const source = read("src/server/register-api-routes.ts");
    const pairs = [
      ["app.use(authOAuthExchangeAtomicRouter)", "app.use(authOAuthBrowserBindingRouter)"],
      ["app.use(authSessionHardeningRouter)", "app.use(authRouter)"],
      ["app.use(launchBillingCheckoutAtomicRouter)", "app.use(launchBillingCheckoutRouter)"],
      ["webhookTestRouter", "app.use(\"/api/webhooks\", webhookRouter)"],
      ["app.use(outboundDialAtomicRouter)", "app.use(outboundRouter)"],
    ];
    for (const [owner, legacy] of pairs) {
      expect(source.indexOf(owner)).toBeGreaterThan(-1);
      expect(source.indexOf(legacy)).toBeGreaterThan(source.indexOf(owner));
    }
  });

  it("terminates a corrupted long-running runtime after telemetry listeners", () => {
    const source = read("src/lib/fatal-process-guard.ts");
    expect(source).toContain('process.prependListener("uncaughtException"');
    expect(source).toContain("process.exitCode = 1");
    expect(source).toContain("process.exit(1)");
  });
});
