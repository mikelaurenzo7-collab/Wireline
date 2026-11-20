import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ revoke: vi.fn(), set: vi.fn(), where: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { update: () => ({ set: h.set }) },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  fetchWithTimeout: vi.fn(),
}));
vi.mock("../src/lib/oauth-provider-revocation", () => ({ revokeCrmProviderTokens: h.revoke }));
import { disconnectApollo } from "../src/lib/apollo-service";
import { disconnectMeta } from "../src/lib/meta-service";

describe("saved tool disconnection", () => {
  it.each([
    ["apollo", disconnectApollo],
    ["meta", disconnectMeta],
  ] as const)(
    "clears %s local credentials without deleting the row",
    async (provider, disconnect) => {
      h.revoke.mockReset().mockResolvedValue({ attempted: 1, revoked: 1 });
      h.where.mockReset().mockResolvedValue(undefined);
      h.set.mockReset().mockReturnValue({ where: h.where });
      await disconnect("owner");
      if (provider === "meta") expect(h.revoke).toHaveBeenCalledWith("owner", provider);
      else expect(h.revoke).not.toHaveBeenCalled();
      expect(h.set).toHaveBeenCalledWith(
        expect.objectContaining({ active: false, accessToken: "", refreshToken: null }),
      );
      expect(h.where).toHaveBeenCalledOnce();
    },
  );

  it("retains the Meta credential when provider revocation cannot be confirmed", async () => {
    h.revoke.mockReset().mockResolvedValue({ attempted: 1, revoked: 0 });
    h.set.mockReset();
    await expect(disconnectMeta("owner")).rejects.toThrow("could not be revoked");
    expect(h.set).not.toHaveBeenCalled();
  });
});
