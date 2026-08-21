import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function routeBlock(source: string, path: string): string {
  const start = source.indexOf(`router.get("${path}"`);
  expect(start, `${path} should be registered`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\n});", start + 1);
  expect(end, `${path} should have a closed handler`).toBeGreaterThan(start);
  return source.slice(start, end + 4);
}

describe("OAuth provider availability contract", () => {
  it("exposes only configured capability booleans, never OAuth credential values", () => {
    const routes = read("src/routes/auth-oauth-routes.ts");
    const availability = routeBlock(routes, "/api/auth/providers");

    const helperStart = routes.indexOf("export function getOAuthProviderAvailability");
    const helperEnd = routes.indexOf('router.get("/api/auth/providers"', helperStart);
    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helper = routes.slice(helperStart, helperEnd);

    expect(availability).toContain("providers:");
    expect(availability).toContain("getOAuthProviderAvailability()");
    expect(availability).not.toContain("process.env");
    for (const [provider, prefix] of [
      ["google", "GOOGLE"],
      ["microsoft", "MICROSOFT"],
      ["yahoo", "YAHOO"],
    ] as const) {
      expect(helper).toMatch(
        new RegExp(
          `${provider}:\\s*Boolean\\(\\s*process\\.env\\.${prefix}_CLIENT_ID(?:\\?\\.trim\\(\\))?\\s*&&\\s*process\\.env\\.${prefix}_CLIENT_SECRET(?:\\?\\.trim\\(\\))?\\s*,?\\s*\\)`,
        ),
      );
    }

    expect(availability).not.toMatch(/client_?id\s*:/i);
    expect(availability).not.toMatch(/client_?secret\s*:/i);
    expect(availability).not.toContain("...process.env");
  });

  it("fails closed and renders provider controls only after confirmed availability", () => {
    const panel = read("src/components/auth/AuthAccessPanel.tsx");

    expect(panel).toContain("type OAuthProviderAvailability = Record<OAuthProvider, boolean>;");
    expect(panel).toMatch(
      /useState<\s*OAuthProviderAvailability\s*\|\s*null\s*>\(\s*null,?\s*\)/,
    );
    expect(panel).toContain('fetch("/api/auth/providers"');
    expect(panel).toContain("setAvailableProviders");
    expect(panel).toMatch(/const oauthProviders\s*=\s*availableProviders\s*\?\s*PROVIDERS\.filter/);
    expect(panel).toContain("availableProviders[provider.id] === true");
    expect(panel).toContain("oauthProviders.map((provider)");
    expect(panel).not.toContain("PROVIDERS.map((provider)");

    const availabilityGate = panel.indexOf("oauthProviders.length > 0");
    const emailForm = panel.indexOf('<form className="wl-access-panel__form"', availabilityGate);
    expect(availabilityGate).toBeGreaterThanOrEqual(0);
    expect(emailForm).toBeGreaterThan(availabilityGate);
    const gatedProviderUi = panel.slice(availabilityGate, emailForm);
    expect(gatedProviderUi).toContain('className="wl-access-panel__oauth"');
    expect(gatedProviderUi).toContain('className="wl-access-panel__divider"');
  });
});
