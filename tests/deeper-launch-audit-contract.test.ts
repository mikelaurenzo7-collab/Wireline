import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("deeper launch audit hardening", () => {
  it("keeps static Vercel CSP aligned with browser voice transport and gates every deploy", () => {
    const vercel = JSON.parse(read("vercel.json")) as {
      headers: Array<{ headers: Array<{ key: string; value: string }> }>;
    };
    const deploy = read("scripts/vercel-deploy.mjs");
    const canonical = read("src/lib/csp.ts");
    const csp = vercel.headers
      .flatMap((rule) => rule.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    expect(csp).toContain("https://*.daily.co");
    expect(csp).toContain("wss://*.daily.co");
    expect(csp).toContain("sha256-rYWQCFq+3047ZWkDO1YafD8wzUpLv9aVQVarfGpJ1y4=");
    expect(csp).toContain("sha256-DW2NBe3Fz6FPszNbns1IMdj7fIvsXZ5h3KkiKEoUbYc=");
    expect(canonical).not.toContain("sha256-3Z3f8c52musA1bws65NjZG2DaDDUbBisRU8i4FLei1w=");
    expect(deploy).toContain('run(process.execPath, ["scripts/check-csp-drift.mjs"]);');
  });

  it("attributes launch measurement to BotBound and excludes previews", () => {
    const measurement = read("public/marketing-measurement.js");

    expect(measurement).toContain('var PLAUSIBLE_DOMAIN = "botbound.me";');
    expect(measurement).toContain('host === "botbound.me"');
    expect(measurement).toContain('host === "www.botbound.me"');
    expect(measurement).toContain('host === "trywireline.com"');
    expect(measurement).toContain('host === "www.trywireline.com"');
    expect((measurement.match(/if \(!isProductionHost\(\)\) return;/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(measurement).toContain('readConsent() !== "granted"');
    expect(measurement).toContain("navigator.globalPrivacyControl === true");
  });

  it("keeps public legal, security, support, About, and machine metadata on BotBound", () => {
    const deletion = read("public/legal/data-deletion.html");
    const chatgptPrivacy = read("public/chatgpt-app-privacy.html");
    const mcpPrivacy = read("public/mcp-privacy.html");
    const security = read("public/.well-known/security.txt");
    const humans = read("public/humans.txt");
    const about = read("src/pages/About.tsx");
    const supportRoute = read("src/routes/support-routes.ts");
    const supportPage = read("src/components/SupportPage.tsx");

    expect(deletion).toContain('href="https://botbound.me/legal/data-deletion"');
    expect(chatgptPrivacy).toContain('href="https://botbound.me/chatgpt-app-privacy.html"');
    expect(mcpPrivacy).toContain('href="https://botbound.me/mcp-privacy.html"');
    expect(security).toContain("Contact: https://botbound.me/support");
    expect(security).toContain("Canonical: https://botbound.me/.well-known/security.txt");
    expect(security).toContain("Policy: https://botbound.me/security");
    expect(humans).toContain("Site: https://botbound.me");
    expect(about).toContain('to="/support"');
    expect(about).not.toContain("mailto:");
    expect(supportPage).toContain('href="#support-ticket"');
    expect(supportPage).not.toContain("mailto:");

    // The old staffed inbox is an internal compatibility recipient only until
    // SUPPORT_INBOX is explicitly provisioned for BotBound. It must never leak
    // through public UI/error copy, and the unverified new mailbox must not be
    // claimed anywhere in these launch surfaces.
    expect(supportRoute).toContain(
      'SUPPORT_RECIPIENT = process.env.SUPPORT_INBOX || "support@trywireline.com"',
    );
    expect((supportRoute.match(/support@trywireline\.com/g) || []).length).toBe(1);
    expect(supportRoute).not.toContain("support@botbound.me");

    for (const source of [
      deletion,
      chatgptPrivacy,
      mcpPrivacy,
      security,
      humans,
      about,
      supportPage,
    ]) {
      expect(source).toContain("BotBound");
      expect(source).not.toContain("support@trywireline.com");
      expect(source).not.toContain("support@botbound.me");
    }
  });

  it("covers authenticated, legal, plugin, and agent-knowledge surfaces the old sweep missed", () => {
    const terms = read("src/components/LegalPage.tsx");
    const privacy = read("src/components/PrivacyPolicyPage.tsx");
    const settings = read("src/pages/SettingsPage.tsx");
    const apps = read("src/pages/ClientAppsPage.tsx");
    const plugin = read("plugin.json");
    const knowledge = read("src/data/wireline-knowledge.ts");

    for (const source of [terms, privacy, settings, apps, plugin, knowledge]) {
      expect(source).not.toContain("support@trywireline.com");
      expect(source).not.toContain("support@botbound.me");
    }
    for (const source of [terms, privacy, settings, plugin, knowledge]) {
      expect(source).not.toContain("https://trywireline.com");
    }

    expect(terms).toContain('to="/support"');
    expect(privacy).toContain('to="/support"');
    expect(settings).toContain('to="/support"');

    expect(apps).toContain('title: "BotBound Command"');
    expect(apps).toContain("BotBoundWordmark");
    expect(apps).not.toContain("mailto:");
    expect(apps).toContain("compatibility MCP service endpoint");
    expect(apps).toContain("https://trywireline.com/mcp");

    const manifest = JSON.parse(plugin) as {
      name: string;
      description: string;
      author: { name: string; url: string; email?: string };
      homepage: string;
    };
    expect(manifest.name).toBe("wireline");
    expect(manifest.description).toContain("BotBound");
    expect(manifest.description).not.toContain("Wireline");
    expect(manifest.author).toEqual({ name: "BotBound", url: "https://botbound.me" });
    expect(manifest.homepage).toBe("https://botbound.me/cursor-plugin.html");

    expect(knowledge).toContain('WIRELINE_URL = "https://botbound.me"');
    expect(knowledge).toContain('WIRELINE_SUPPORT_URL = "https://botbound.me/support"');
    expect(knowledge).toContain('"BotBound runs calls, texts, follow-up');
    expect(knowledge).not.toMatch(/"WIRELINE\b/);
  });

  it("keeps MCP public metadata on BotBound while preserving protocol and callback compatibility", () => {
    const mcp = read("src/lib/mcp-app-metadata.ts");
    const cursor = read("public/cursor-plugin.html");
    const claude = read("public/claude-connector.html");

    expect(mcp).toContain('MCP_SERVER_NAME = "wireline"');
    expect(mcp).toContain('name: "com.trywireline/mcp"');
    expect(mcp).toContain('MCP_SERVER_TITLE = "BotBound"');
    expect(mcp).toContain('MCP_WEBSITE_URL = "https://botbound.me"');
    expect(mcp).toContain('MCP_DOCUMENTATION_URL = "https://botbound.me/claude-connector.html"');
    expect(mcp).toContain('MCP_PRIVACY_URL = "https://botbound.me/mcp-privacy.html"');
    expect(mcp).toContain('MCP_ICON_URL = "https://botbound.me/wireline-chatgpt-app-icon.svg"');
    expect(mcp).toContain('MCP_SUPPORT_URL = "https://botbound.me/support"');
    expect(mcp).toContain("websiteUrl: MCP_WEBSITE_URL");
    expect(mcp).toContain(
      'redirect_domains: ["https://botbound.me", "https://trywireline.com"]',
    );

    // trywireline.com is still intentionally visible only as the compatibility
    // MCP service endpoint until the user's external OAuth/provider cutover.
    for (const source of [cursor, claude]) {
      expect(source).toContain("https://trywireline.com/mcp");
      expect(source).toContain("legacy service host");
      expect(source).toContain("https://botbound.me/support");
      expect(source).not.toContain("support@trywireline.com");
      expect(source).not.toContain("support@botbound.me");
    }
  });

  it("terminalizes provider-expired Checkout operations before the broad billing router", async () => {
    const preflight = read("src/middleware/stripe-checkout-expiration-preflight.ts");
    const registry = read("src/server/register-api-routes.ts");
    const handled = read("scripts/lib/stripe-handled-events.mjs");
    const { getHandledStripeWebhookEvents } =
      await import("../scripts/lib/stripe-handled-events.mjs");

    expect(preflight).toContain('event.type === "checkout.session.expired"');
    expect(preflight).toContain("stripe.webhooks.constructEvent");
    expect(preflight).toContain("wireline_checkout_operation_id");
    expect(preflight).toContain("wireline_user_id");
    expect(preflight).toContain("checkoutOperations.stripeCheckoutSessionId, session.id");
    expect(preflight).toContain('status: "expired"');
    expect(preflight).toContain('failureCode: "stripe_checkout_session_expired"');
    expect(preflight).toContain('status: "processed"');

    const mount = registry.indexOf(
      'app.use("/api/stripe-webhook", stripeCheckoutExpirationPreflight)',
    );
    const billing = registry.indexOf('app.use("/api", billingRouter)');
    expect(mount).toBeGreaterThan(-1);
    expect(billing).toBeGreaterThan(mount);
    expect(handled).toContain("stripe-checkout-expiration-preflight.ts");
    expect(getHandledStripeWebhookEvents()).toContain("checkout.session.expired");
  });

  it("promotes the reconciled active-subscription provenance guard to a validated invariant", () => {
    const migration = read(
      "drizzle/migrations/0156_validate_active_subscription_provenance.sql",
    );
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const last = journal.entries.at(-1);

    expect(migration).toContain(
      'VALIDATE CONSTRAINT "wireline_subscriptions_active_provenance_check"',
    );
    expect(last?.tag).toBe("0156_validate_active_subscription_provenance");
    expect(last?.idx).toBe(54);
  });
});
