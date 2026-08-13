import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch readiness quadruple-pass 2026-07-27", () => {
  it("revokes provider OAuth grants before local CRM disconnect", () => {
    const helper = read("src/lib/oauth-provider-revocation.ts");
    expect(helper).toContain("export async function revokeCrmProviderTokens");
    expect(helper).toContain("export async function revokeAllOAuthGrantsForUser");
    expect(helper).toContain("oauth2.googleapis.com/revoke");
    expect(helper).toContain("slack.com/api/auth.revoke");

    for (const file of [
      "src/lib/meta-service.ts",
      "src/lib/google-sheets-service.ts",
      "src/lib/slack-service.ts",
      "src/lib/hubspot-service.ts",
      "src/lib/zoom-service.ts",
      "src/lib/salesforce-service.ts",
      "src/lib/x-service.ts",
      "src/lib/shopify-service.ts",
      "src/lib/square-service.ts",
      "src/lib/microsoft-graph-service.ts",
      "src/lib/apollo-service.ts",
    ]) {
      expect(read(file)).toContain("revokeCrmProviderTokens");
    }
  });

  it("revokes OAuth grants during GDPR external release before purge", () => {
    const deletion = read("src/lib/account-deletion.ts");
    expect(deletion).toContain("revokeAllOAuthGrantsForUser");
    expect(deletion).toContain("oauthRevoked");
    expect(deletion).toContain("oauthAttempted");

    const worker = read("src/lib/job-worker-base.ts");
    expect(worker).toContain("oauth_revoked: release.oauthRevoked");
  });

  it("revokes mailbox tokens on email and Yahoo disconnect", () => {
    expect(read("src/routes/email-routes.ts")).toContain("revokeMailboxAccountTokens");
    expect(read("src/routes/oauth/yahoo.ts")).toContain("revokeMailboxAccountTokens");
  });

  it("fingerprints portal products so plan-switch choices stay current", () => {
    const portal = read("src/routes/billing-portal-readiness-routes.ts");
    expect(portal).toContain("portalProductsFingerprint");
    expect(portal).toContain("wireline_portal_products_fp");
    expect(portal).toContain("PORTAL_PRODUCTS_FINGERPRINT_KEY");
    expect(portal).not.toContain("`wireline-managed-customer-portal-${FOUNDER_CATALOG_VERSION}`");
  });

  it("surfaces CRM disconnect failures instead of silent refresh", () => {
    const card = read("src/components/CrmConnectionCard.tsx");
    expect(card).toContain("if (!response.ok)");
    expect(card).toContain("Could not disconnect");
    expect(card).not.toContain("/* ignore */");
  });

  it("keeps customer-facing Runtime Balance naming on buyer surfaces", () => {
    expect(read("src/lib/voice-pricing-display.ts")).toContain("Runtime Balance");
    expect(read("src/lib/voice-pricing-display.ts")).not.toContain("Conversation Balance");
    expect(read("src/data/vertical-wedges.ts")).not.toContain("Conversation Balance");
    expect(read("src/lib/showcase-assistant.ts")).toContain("Runtime Balance");
    expect(read("src/routes/vapi/showcase-handlers.ts")).toContain("Runtime Balance");
    // The retired post-hoc voice debit (and its ledger copy) stays deleted;
    // the live settlement path owns the buyer-visible ledger reason.
    expect(read("src/lib/credit-wallet.ts")).not.toContain(
      "Conversation Balance for pay-as-you-go",
    );
    expect(read("src/lib/voice-completion-grace.ts")).toContain(
      'customerReason: "Completed live-call usage"',
    );
  });
});
