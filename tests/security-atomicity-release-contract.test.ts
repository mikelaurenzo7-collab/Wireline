import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("security and external-operation atomicity", () => {
  it("revokes issued sessions through a monotonic database generation", () => {
    const baseMigration = read("drizzle/migrations/0120_security_atomicity_team_sessions.sql");
    const versionMigration = read("drizzle/migrations/0127_monotonic_session_version.sql");
    const auth = read("src/lib/auth-service.ts");
    const middleware = read("src/middleware/auth.ts");
    const sessionRoutes = read("src/routes/auth-session-hardening-routes.ts");

    expect(baseMigration).toContain("wireline_revoke_sessions_on_password_change");
    expect(baseMigration).toContain("BEFORE UPDATE OF password_hash");
    expect(versionMigration).toContain("ADD COLUMN IF NOT EXISTS session_version bigint");
    expect(versionMigration).toContain("NEW.session_version := OLD.session_version + 1");
    expect(auth).toContain("session_version: user.sessionVersion");
    expect(auth).toContain('throw new Error("SESSION_VERSION_REQUIRED")');
    expect(auth).toContain("await scryptAsync");
    expect(middleware).toContain("tokenSessionVersion(payload)");
    expect(middleware).toContain("version === user.sessionVersion");
    expect(middleware).toContain("tenantStore.run(payload.sub");
    expect(middleware).toContain("tenantStore.run(userId");
    expect(sessionRoutes).toContain("sessionUsers.sessionVersion} + 1");
    expect(sessionRoutes).toContain("sessionVersion: user.sessionVersion");
    expect(sessionRoutes).toContain("tenantStore.run(payload.sub");
    expect(sessionRoutes).toContain("tenantStore.run(userId");
  });

  it("claims invitations only for the bound identity and lists verified workspaces", () => {
    const source = read("src/routes/team-routes.ts");
    const page = read("src/pages/AcceptInvite.tsx");
    const baseRls = read("drizzle/migrations/0122_team_workspace_rls.sql");
    const consolidatedRls = read(
      "drizzle/migrations/0123_team_workspace_rls_policy_consolidation.sql",
    );
    const claimFunction = read("drizzle/migrations/0124_team_invitation_claim_function.sql");
    const directoryFunction = read(
      "drizzle/migrations/0125_user_workspace_directory_function.sql",
    );

    expect(source).toContain("wireline_accept_team_invitation");
    expect(source).toContain("wireline_list_user_workspaces");
    expect(source).toContain("tenantStore.run(req.user.id");
    expect(source).toContain("tenantId: accepted.tenant_id");
    expect(source).toContain('"/api/team/workspaces/:tenantId/select"');
    expect(source).toContain("/accept-invite#token=");
    expect(source).toContain("INVITE_TOKEN_RE");
    expect(source).toContain("requireUuid(req.params.tenantId");
    expect(source).toContain("emailRateLimiter");
    expect(page).toContain("wireline_pending_invitation");
    expect(page).toContain("window.history.replaceState");
    expect(page).toContain('window.location.assign("/overview")');
    expect(baseRls).toContain("REVOKE ALL ON TABLE public.wireline_team_members");
    expect(consolidatedRls).toContain("CREATE POLICY workspace_read");
    expect(consolidatedRls).toContain("tenant_id = (SELECT public.wireline_current_user_id())");
    expect(consolidatedRls).toContain("OR user_id = (SELECT public.wireline_current_user_id())");
    expect(consolidatedRls).toContain("CREATE POLICY workspace_insert");
    expect(consolidatedRls).toContain("CREATE POLICY workspace_update");
    expect(consolidatedRls).toContain("CREATE POLICY workspace_delete");
    expect(claimFunction).toContain("SECURITY DEFINER");
    expect(claimFunction).toContain(
      "wireline_current_user_id() IS DISTINCT FROM p_accepting_user_id",
    );
    expect(claimFunction).toContain("invitation_token_hash = NULL");
    expect(claimFunction).toContain("lower(member.email) = lower(p_accepting_email)");
    expect(directoryFunction).toContain("SECURITY DEFINER");
    expect(directoryFunction).toContain("wireline_current_user_id() IS DISTINCT FROM p_user_id");
    expect(directoryFunction).toContain("member.user_id = p_user_id");
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
    expect(source).toContain("type DeniedOutboundDialGate = Extract<");
    expect(source).toContain("function gateResponse(res: Response, gate: DeniedOutboundDialGate)");
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

  it("binds OAuth code deletion to the browser state through a restricted function", () => {
    const source = read("src/routes/auth-oauth-exchange-atomic-routes.ts");
    const migration = read("drizzle/migrations/0126_oauth_bridge_atomic_consume_function.sql");

    expect(source).toContain("wireline_consume_oauth_pending_code");
    expect(source).toContain("tenantStore.run(entry.user_id");
    expect(source).not.toContain("DELETE FROM wireline_oauth_pending_codes");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("DELETE FROM public.wireline_oauth_pending_codes");
    expect(migration).toContain("pending.code_hash = p_code_hash");
    expect(migration).toContain("pending.bridge_state_hash = p_bridge_state_hash");
    expect(migration).toContain("pending.expires_at > clock_timestamp()");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.wireline_consume_oauth_pending_code",
    );
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
