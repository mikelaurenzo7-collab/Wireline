import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({ revoke: vi.fn(), where: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { delete: () => ({ where: h.where }) },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  fetchWithTimeout: vi.fn(),
}));
vi.mock("../src/lib/oauth-provider-revocation", () => ({ revokeCrmProviderTokens: h.revoke }));

import { disconnectGoogleSheets } from "../src/lib/google-sheets-service";
import { disconnectMicrosoftGraph } from "../src/lib/microsoft-graph-service";

describe("legacy office tool disconnection", () => {
  it.each([
    ["Google Sheets", "google_sheets", () => disconnectGoogleSheets("owner")],
    ["Teams", "microsoft_teams", () => disconnectMicrosoftGraph("owner", "microsoft_teams")],
    ["Excel", "microsoft_excel", () => disconnectMicrosoftGraph("owner", "microsoft_excel")],
  ] as const)(
    "removes only the %s local CRM record without a broad provider revoke",
    async (_name, provider, disconnect) => {
      h.where.mockReset().mockResolvedValue(undefined);
      h.revoke.mockReset();
      await disconnect();
      expect(h.where).toHaveBeenCalledOnce();
      const query = new PgDialect().sqlToQuery(h.where.mock.calls[0][0]);
      expect(query.params).toEqual(["owner", provider]);
      expect(h.revoke).not.toHaveBeenCalled();
    },
  );
});
