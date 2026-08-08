import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("tenant marketing email compliance contract", () => {
  const compliance = read("src/lib/email-compliance.ts");
  const integrations = read("src/lib/integrations.ts");
  const schema = read("src/db/schema-base.ts");
  const routes = read("src/routes/email-unsubscribe-routes.ts");
  const identity = read("src/lib/company-identity.ts");
  const provisioning = read("src/lib/phone-provisioning.ts");
  const twilio = read("src/routes/twilio-webhook-base.ts");

  it("scopes campaign opt-outs to the tenant sender", () => {
    expect(schema).toContain('"wireline_tenant_email_suppressions"');
    expect(schema).toContain('"wireline_tenant_email_suppressions_user_email_key"');
    expect(compliance).toContain("export async function isTenantEmailSuppressed");
    expect(integrations).toContain("isTenantEmailSuppressed(this.userId, params.to)");
    expect(routes).toContain('scope: "tenant"');
    expect(routes).toContain("recordTenantEmailSuppression");
  });

  it("requires sender identity and never presents a lead as a Wireline account holder", () => {
    expect(identity).toContain("physicalPostalAddress");
    expect(identity).toContain("valid physical postal address for commercial email");
    expect(compliance).toContain("Marketing message from");
    expect(compliance).toContain("buildTenantComplianceFooterHtml");
    expect(integrations).toContain("getTenantMarketingIdentity(this.userId)");
    expect(integrations).toContain("connect a tenant mailbox before sending cadences");
    expect(integrations).not.toContain(
      'body: `${params.body}${buildComplianceFooterHtml(params.to)}`',
    );
  });

  it("keeps transactional tenant mail out of marketing suppression", () => {
    expect(integrations).toContain("if (params.marketing)");
    expect(integrations).toContain("text: params.body");
    expect(integrations).toContain("Non-marketing messages here are transactional/relationship mail");
  });

  it("pairs idempotent SMS persistence with an explicit Twilio retry policy", () => {
    expect(twilio).toContain("await drizzle.transaction(async (tx) =>");
    expect(twilio).toContain(".onConflictDoNothing()");
    expect(twilio).toContain("return res.status(503).send(twimlEmpty())");
    expect(provisioning).toContain("#rc=2&rp=5xx,ct,rt");
  });
});
