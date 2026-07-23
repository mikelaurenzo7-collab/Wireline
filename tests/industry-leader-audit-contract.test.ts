import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("industry-leader audit hardening contracts", () => {
  it("provisions Twilio numbers with voiceFallbackUrl for Vapi resilience", () => {
    const provisioning = read("src/lib/phone-provisioning.ts");
    expect(provisioning).toContain("voiceFallbackUrl");
    expect(provisioning).toContain("/api/twilio-webhook/voice-fallback");
    expect(provisioning).toContain("voiceFallbackMethod");
  });

  it("never persists undefined Microsoft access tokens on failed refresh", () => {
    const integrations = read("src/lib/integrations.ts");
    const tokenFn = integrations.slice(integrations.indexOf("getMicrosoftToken"));
    expect(tokenFn).toContain("if (!r.ok || !d.access_token)");
    expect(tokenFn).toContain('d.error === "invalid_grant"');
    expect(tokenFn.indexOf("if (!r.ok || !d.access_token)")).toBeLessThan(
      tokenFn.indexOf("encryptSecret(d.access_token)"),
    );
  });

  it("fails closed on spend-sensitive Upstash rate limiters", () => {
    const limits = read("src/middleware/api-rate-limits.ts");
    expect(limits).toContain("if (opts.failClosedOnError)");
    expect(limits).toContain("distributedLimiterStatus()");
    expect(limits).toMatch(/dialRateLimiter[\s\S]*failClosedOnError:\s*true/);
    expect(limits).toMatch(/smsRateLimit[\s\S]*failClosedOnError:\s*true/);
    expect(limits).toMatch(/campaignWriteRateLimit[\s\S]*failClosedOnError:\s*true/);
    expect(limits).toMatch(/phoneNumberRateLimiter[\s\S]*failClosedOnError:\s*true/);
  });

  it("persists failover voicemail recordings instead of log-only", () => {
    const webhook = read("src/routes/twilio-webhook-base.ts");
    expect(webhook).toContain("Voicemail left during voice failover");
    expect(webhook).toContain("schema.callLogs");
    expect(webhook).toContain("recordingUrl");
    expect(webhook).toContain("sendEmail");
    // tenantStore is AsyncLocalStorage<string> — must pass userId string, not an object.
    expect(webhook).toMatch(/tenantStore\.run\(tenantUserId,\s*async\s*\(\)\s*=>/);
    expect(webhook).not.toContain("tenantStore.run({ userId:");
  });

  it("surfaces CRM reconnect signals in integration health", () => {
    const health = read("src/lib/integration-health.ts");
    const banner = read("src/components/IntegrationHealthBanner.tsx");
    expect(health).toContain("reconnect_hubspot");
    expect(health).toContain("reconnect_salesforce");
    expect(health).toContain("reconnect_google_sheets");
    expect(banner).toContain("reconnect_hubspot");
  });

  it("deactivates Google Sheets on terminal refresh failure", () => {
    const sheets = read("src/lib/google-sheets-service.ts");
    expect(sheets).toContain("invalid_grant");
    expect(sheets).toContain("active: false");
  });

  it("reports team invite email_sent truthfully and prefers Resend", () => {
    const team = read("src/routes/team-routes.ts");
    expect(team).toContain("email_sent: emailSent");
    expect(team).toContain('import("../lib/email-service")');
  });

  it("keeps Yahoo out of mailbox connect UI until fetch/send ship", () => {
    const mailbox = read("src/components/MailboxConnectionCard.tsx");
    expect(mailbox).not.toMatch(/id:\s*"yahoo"/);
    expect(mailbox).toContain("XOAUTH2 IMAP");
  });

  it("does not auto-enable unimplemented commerce stub tools on role defaults", () => {
    const caps = read("src/lib/agent-capabilities.ts");
    // Catalog may still list them with honest "not available" copy, but ROLE
    // default sets must not advertise them on every ecommerce/support agent.
    const roleSets = caps.slice(caps.indexOf("export const ROLE_TOOL_SETS"));
    const ecommerceBlock = roleSets.slice(
      roleSets.indexOf("ecommerce:"),
      roleSets.indexOf("scheduler:"),
    );
    expect(ecommerceBlock).not.toContain("shopify_apply_discount");
    expect(ecommerceBlock).not.toContain("square_send_invoice");
    expect(caps).toContain("Not available on live calls yet");
  });

  it("routes Goals customization CTA to Insights goals view", () => {
    const customization = read("src/pages/CustomizationSettings.tsx");
    expect(customization).toContain('href: "/insights?tab=performance&view=goals"');
    expect(customization).toContain("Success targets");
    expect(customization).not.toMatch(/label:\s*"Goals"[\s\S]*?href:\s*"\/knowledge"/);
  });

  it("keeps public changelog on OpenAI→Gemini→Gateway truth", () => {
    const changelog = read("src/components/PublicChangelog.tsx");
    expect(changelog).not.toContain("Claude Sonnet 4.6");
    expect(changelog).not.toContain("Claude Opus 4.7");
    expect(changelog).toContain("OpenAI GPT-5.6 Terra");
    expect(changelog).not.toContain("Recaps · Triage · Activity · Cockpit");
  });

  it("keeps Twilio WhatsApp out of platform capability chips until private beta is live", () => {
    const catalog = read("src/lib/workspace-integration-catalog.ts");
    const twilioBlock = catalog.slice(
      catalog.indexOf('id: "twilio"'),
      catalog.indexOf('id: "hubspot"'),
    );
    expect(twilioBlock).not.toMatch(/capabilities:\s*\[[^\]]*WhatsApp/);
    expect(twilioBlock).toContain("private beta");
  });
});
