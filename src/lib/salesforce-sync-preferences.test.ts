import { describe, expect, it } from "vitest";

import {
  DEFAULT_SALESFORCE_SYNC_PREFERENCES,
  SalesforceSyncPreferencesSchema,
  getSalesforceSyncPreferences,
  mergeSalesforceSyncPreferences,
} from "./salesforce-sync-preferences";

describe("Salesforce sync preferences", () => {
  it("preserves the historical enabled behavior for legacy or invalid metadata", () => {
    expect(getSalesforceSyncPreferences(undefined)).toEqual(DEFAULT_SALESFORCE_SYNC_PREFERENCES);
    expect(getSalesforceSyncPreferences({ wireline: { salesforce: { callActivitySyncEnabled: "yes" } } })).toEqual(
      DEFAULT_SALESFORCE_SYNC_PREFERENCES,
    );
  });

  it("reads an explicit paused state", () => {
    expect(
      getSalesforceSyncPreferences({
        wireline: { salesforce: { callActivitySyncEnabled: false } },
      }),
    ).toEqual({ callActivitySyncEnabled: false });
  });

  it("merges preferences without discarding unrelated connection metadata", () => {
    const merged = mergeSalesforceSyncPreferences(
      {
        providerState: { tenant: "acme" },
        wireline: { integrationHealth: { lastCheckedAt: "2026-06-24T00:00:00.000Z" } },
      },
      { callActivitySyncEnabled: false },
    );

    expect(merged).toMatchObject({
      providerState: { tenant: "acme" },
      wireline: {
        integrationHealth: { lastCheckedAt: "2026-06-24T00:00:00.000Z" },
        salesforce: { callActivitySyncEnabled: false },
      },
    });
  });

  it("rejects unrecognized preference payloads at the API boundary", () => {
    expect(SalesforceSyncPreferencesSchema.safeParse({ callActivitySyncEnabled: true }).success).toBe(true);
    expect(
      SalesforceSyncPreferencesSchema.safeParse({
        callActivitySyncEnabled: true,
        attachAudio: true,
      }).success,
    ).toBe(false);
  });
});
