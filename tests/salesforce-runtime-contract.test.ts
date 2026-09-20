import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Salesforce activity delivery contract", () => {
  it("defaults legacy connections to the established enabled behavior", () => {
    const preferences = source("src/lib/salesforce-sync-preferences.ts");

    expect(preferences).toContain("callActivitySyncEnabled: true");
    expect(preferences).toContain("SalesforceSyncPreferencesSchema");
    expect(preferences).toContain("mergeSalesforceSyncPreferences");
  });

  it("keeps preference writes authenticated, user-scoped, and connection-scoped", () => {
    const route = source("src/routes/oauth/status.ts");

    expect(route).toContain('"/api/oauth/crm/salesforce/preferences"');
    expect(route).toContain("authenticateUser");
    expect(route).toContain("eq(schema.crmConnections.userId, userId)");
    expect(route).toContain('eq(schema.crmConnections.provider, "salesforce")');
    expect(route).toContain("mergeSalesforceSyncPreferences");
  });

  it("gates Salesforce Task writes through the saved delivery preference", () => {
    const salesforce = source("src/lib/salesforce-service.ts");

    expect(salesforce).toContain("isSalesforceCallActivitySyncEnabled");
    expect(salesforce).toContain("Salesforce call activity sync disabled by connection preference");
    expect(salesforce).toContain("export async function logCall");
  });

  it("presents only implemented delivery controls and rollback-aware feedback", () => {
    const page = source("src/pages/SalesforceIntegrationPage.tsx");

    expect(page).toContain("/api/oauth/crm/salesforce/preferences");
    expect(page).toContain("setCallActivitySyncEnabled(previousValue)");
    expect(page).toContain('title="Call Activity Sync Updated"');
    expect(page).toContain('title="Call Activity Sync Was Not Updated"');
    expect(page).not.toContain("Preview configuration");
    expect(page).not.toContain("Save preview choices");
    expect(page).not.toContain("Draft saved for this session");
  });
});
