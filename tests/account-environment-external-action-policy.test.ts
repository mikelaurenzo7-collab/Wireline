import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACCOUNT_ENVIRONMENT_UNAVAILABLE,
  DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED,
  NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
  externalEntityActionPolicy,
  isReservedDemoEmailAddress,
  isReservedDemoPhoneNumber,
  liveExternalActionPolicy,
} from "../src/lib/account-environment-policy";
import {
  DEMO_SMS_NUMBERS,
  LEGACY_DEMO_SMS_NUMBERS,
  SAMPLE_CUSTOMERS,
} from "../src/lib/demo-account-seed";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function fromMarker(contents: string, marker: string): string {
  const index = contents.indexOf(marker);
  expect(index).toBeGreaterThanOrEqual(0);
  return contents.slice(index);
}

describe("account-environment live external-action policy", () => {
  it("allows only an explicit production account and fails closed otherwise", () => {
    expect(liveExternalActionPolicy("production")).toEqual({
      allowed: true,
      environment: "production",
    });

    for (const environment of ["demo", "test"] as const) {
      expect(liveExternalActionPolicy(environment)).toMatchObject({
        allowed: false,
        environment,
        status: 403,
        code: NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
      });
    }

    for (const environment of [null, undefined, "staging"]) {
      expect(liveExternalActionPolicy(environment)).toMatchObject({
        allowed: false,
        environment: null,
        status: 503,
        code: ACCOUNT_ENVIRONMENT_UNAVAILABLE,
      });
    }
  });

  it("guards each shared provider-mutation boundary before vendor work", () => {
    const policy = source("src/lib/account-environment-policy.ts");
    const identity = fromMarker(
      source("src/lib/paid-bot-identity.ts"),
      "export async function ensurePaidBotIdentity",
    );
    const provisioning = fromMarker(
      source("src/lib/phone-provisioning.ts"),
      "export async function provisionTenantNumber",
    );
    const messaging = fromMarker(
      source("src/lib/twilio-service.ts"),
      "export async function sendTenantMessage",
    );
    const email = fromMarker(source("src/lib/integrations.ts"), "async sendEmail(params:");
    const carrierRoute = source("src/routes/carrier-routes.ts");
    const agentMailRoutes = source("src/routes/agentmail-routes.ts");
    const teamRoutes = source("src/routes/team-routes.ts");
    const dailyBrief = source("src/lib/daily-brief.ts");
    const notifications = source("src/lib/notifications.ts");
    const postCall = source("src/lib/post-call-digest.ts");
    const identityReconciler = source("scripts/reconcile-paid-bot-identities.mts");
    const billing = source("src/middleware/account-deletion-billing-fence.ts");
    const billingRoutes = source("src/routes/billing-routes.ts");
    const extraAgents = source("src/routes/extra-agent-billing-atomic-routes.ts");
    const nativeCarrier = source("src/lib/voice/native-phone-carrier.ts");
    const nativeInventory = fromMarker(
      nativeCarrier,
      "export async function listNativeAvailableLocalNumbers",
    );
    const nativeProvisioning = fromMarker(
      source("src/lib/voice/native-phone-provisioning.ts"),
      "export async function provisionNativeTenantNumber",
    );
    const nativeAssignment = fromMarker(
      source("src/lib/voice/native-phone-assignment.ts"),
      "export async function assignNativePhoneLine",
    );
    const nativeActivation = fromMarker(
      source("src/lib/voice/xai-phone-activation-service.ts"),
      "export async function provisionNativeXAIPhone",
    );

    expect(policy).toContain("tenantStore.run(userId, async () =>");
    expect(identity.indexOf("assertLiveExternalActionAllowed")).toBeLessThan(
      identity.indexOf("ensurePaidBotPhone(input.userId"),
    );
    expect(provisioning.indexOf("liveExternalActionPolicyForUser(userId)")).toBeLessThan(
      provisioning.indexOf("purchaseTwilioLocalNumber("),
    );
    expect(carrierRoute).toContain('result.code === "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED"');
    expect(agentMailRoutes).toContain(
      'assertLiveExternalActionAllowed(userId, "managed_agentmail_mailbox_provision")',
    );
    expect(agentMailRoutes).toContain(
      'assertLiveExternalActionAllowed(userId, "agentmail_mailbox_connect")',
    );
    expect(agentMailRoutes).not.toContain(
      'assertLiveExternalActionAllowed(userId, "agentmail_mailbox_disconnect")',
    );
    expect(teamRoutes).toContain(
      'assertLiveExternalActionAllowed(req.tenantId, "team_invitation_email")',
    );
    expect(dailyBrief).toContain('assertLiveExternalActionAllowed(userId, "daily_brief_email")');
    expect(notifications.match(/liveExternalActionPolicyForUser\(this\.userId\)/g)).toHaveLength(2);
    expect(postCall.indexOf("liveExternalActionPolicyForUser(ctx.userId)")).toBeLessThan(
      postCall.indexOf("return drizzle.transaction("),
    );
    expect(identityReconciler).toContain('eq(schema.settings.accountEnvironment, "production")');
    expect(messaging.indexOf("liveExternalActionPolicyForUser(userId)")).toBeLessThan(
      messaging.indexOf("createTwilioMessageWithRateLimitRetry("),
    );
    expect(email.indexOf("liveExternalActionPolicyForUser(this.userId)")).toBeLessThan(
      email.indexOf("return await this.sendGoogleEmail("),
    );
    expect(billing.indexOf("liveExternalActionPolicyForUser(req.user.id)")).toBeLessThan(
      billing.indexOf("acquireAccountOperationLease({"),
    );
    expect(extraAgents.indexOf("liveExternalActionPolicyForUser(req.user.id)")).toBeLessThan(
      extraAgents.indexOf("stripe.subscriptions.retrieve(subscriptionId)"),
    );
    expect(nativeInventory.indexOf("assertNativePhoneExternalActionAllowed")).toBeLessThan(
      nativeInventory.indexOf("return listNativeAvailableLocalNumbersAfterAuthorization"),
    );
    expect(nativeCarrier).toContain("liveExternalActionPolicyForUser(userId)");
    expect(
      nativeProvisioning.indexOf("liveExternalActionPolicyForUser(input.userId)"),
    ).toBeLessThan(nativeProvisioning.indexOf("runTenantProviderWorkWithDeletionFence({"));
    expect(nativeAssignment.indexOf("assertLiveExternalActionAllowed")).toBeLessThan(
      nativeAssignment.indexOf("runTenantProviderWorkWithDeletionFence({"),
    );
    expect(nativeActivation.indexOf("assertLiveExternalActionAllowed")).toBeLessThan(
      nativeActivation.indexOf("runTenantProviderWorkWithDeletionFence({"),
    );
    const liveVideoCheckout = fromMarker(billingRoutes, '"/billing/live-video-checkout"');
    expect(liveVideoCheckout.indexOf("assertLiveExternalActionAllowed")).toBeLessThan(
      liveVideoCheckout.indexOf("validateFounderCatalogPriceId(configuredPriceId)"),
    );
  });

  it("uses only reserved, inert contact fixtures for demo data", () => {
    for (const customer of SAMPLE_CUSTOMERS) {
      expect(customer.phone).toMatch(/^\+1[2-9]\d{2}55501\d{2}$/);
      expect(customer.email).toMatch(/@example\.com$/);
    }
    expect(new Set(SAMPLE_CUSTOMERS.map((customer) => customer.phone)).size).toBe(
      SAMPLE_CUSTOMERS.length,
    );
    for (const phone of DEMO_SMS_NUMBERS) {
      expect(phone).toMatch(/^\+1[2-9]\d{2}55501\d{2}$/);
    }
    expect(DEMO_SMS_NUMBERS).not.toEqual(LEGACY_DEMO_SMS_NUMBERS);
  });

  it("keeps reserved contact fixtures inert even after an unsafe production promotion", () => {
    for (const email of [
      "customer@example.com",
      "person@sub.example.net",
      "someone@fixtures.example",
    ]) {
      expect(isReservedDemoEmailAddress(email)).toBe(true);
      expect(externalEntityActionPolicy({ email })).toMatchObject({
        allowed: false,
        code: DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED,
        reason: "reserved_email",
      });
    }
    for (const phone of ["+1 (212) 555-0100", "+14155550199", "2025550198"]) {
      expect(isReservedDemoPhoneNumber(phone)).toBe(true);
      expect(externalEntityActionPolicy({ phone })).toMatchObject({
        allowed: false,
        code: DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED,
        reason: "reserved_phone",
      });
    }
    expect(externalEntityActionPolicy({ leadDemo: true })).toMatchObject({
      allowed: false,
      reason: "demo_lead",
    });
    expect(
      externalEntityActionPolicy({ email: "real@customer.co", phone: "+14155552671" }),
    ).toEqual({ allowed: true });
  });

  it("guards tenant action integrations while preserving the system showcase lane", () => {
    const engine = source("src/lib/action-engine.ts");
    const core = source("src/routes/vapi/tool-handlers-core.ts");
    const calendar = source("src/routes/vapi/tool-handlers-calendar.ts");
    const workflow = source("src/routes/vapi/tool-handlers-workflow.ts");
    const enrichment = source("src/routes/vapi/tool-handlers-enrichment.ts");
    const notifications = source("src/routes/vapi/tool-handlers-notifications.ts");
    const apollo = source("src/lib/apollo-service.ts");
    const slack = source("src/lib/slack-service.ts");
    const showcase = source("src/routes/vapi/showcase-handlers.ts");
    const outboundCall = fromMarker(
      source("src/lib/voice/outbound-call-service.ts"),
      "export async function placeOutboundCall",
    );

    expect(engine.indexOf("liveExternalActionPolicyForUser(userId)")).toBeLessThan(
      engine.indexOf("superviseClientCommunication({"),
    );
    expect(core).toContain("tenantVapiExternalActionBlock");
    expect(core.indexOf('"vapi_tenant_signup_link_email"')).toBeLessThan(
      core.indexOf('import("../../lib/email-service")'),
    );
    expect(calendar.indexOf("assertLiveExternalActionAllowed")).toBeLessThan(
      calendar.indexOf('import("../../lib/docusign-service")'),
    );
    expect(workflow).toContain("warmTransferExternalActionBlock(");
    expect(workflow).toContain("const postNotificationBlock = await");
    expect(workflow).toContain("const finalExternalActionBlock = await");
    expect(enrichment).toContain("assertTenantEnrichmentAction");
    expect(notifications).toContain('"vapi_slack_notification"');
    expect(apollo.indexOf("tenantApolloAllowed(userId")).toBeLessThan(
      apollo.indexOf("const auth = await getApolloAuth(userId)"),
    );
    expect(slack.indexOf("tenantSlackAllowed(userId")).toBeLessThan(
      slack.indexOf("const token = await getToken(userId)"),
    );
    expect(outboundCall.indexOf("assertExternalEntityActionAllowed")).toBeLessThan(
      outboundCall.indexOf("runTenantProviderWorkWithDeletionFence"),
    );
    expect(showcase).toContain("handleSendSignupLink(toolArgs");
    expect(showcase).toContain("handleSendPaymentLink(toolArgs");
    expect(showcase).not.toContain("liveExternalActionPolicyForUser");
  });
});
