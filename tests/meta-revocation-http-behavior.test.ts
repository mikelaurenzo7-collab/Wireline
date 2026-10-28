import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({ fetch: vi.fn(), set: vi.fn(), where: vi.fn(), row: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({ from: () => ({ where: () => ({ limit: h.row }) }) }),
    update: () => ({ set: h.set }),
  },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  fetchWithTimeout: h.fetch,
}));
vi.mock("../src/lib/secret-vault", () => ({ decryptSecret: (value: string) => value }));
import { disconnectMeta, disconnectMetaLocally } from "../src/lib/meta-service";

beforeEach(() => {
  h.fetch.mockReset();
  h.set.mockReset().mockReturnValue({ where: h.where });
  h.where.mockReset().mockResolvedValue(undefined);
  h.row.mockReset().mockResolvedValue([
    {
      provider: "meta",
      accessToken: "test-token",
      refreshToken: null,
      instanceUrl: null,
      metadata: null,
    },
  ]);
});

describe("Meta grant revocation at the provider boundary", () => {
  it.each([
    [400, '{"error":{"message":"bad request"}}'],
    [401, '{"error":{"message":"unauthorized"}}'],
    [500, '{"error":{"message":"service unavailable"}}'],
    [200, '{"success":false}'],
    [200, "not json"],
  ])("retains credentials after unconfirmed HTTP %s response", async (status, body) => {
    h.fetch.mockResolvedValueOnce(new Response(body, { status }));
    await expect(disconnectMeta("owner")).rejects.toThrow("could not be revoked");
    expect(h.set).not.toHaveBeenCalled();
  });

  it("retains credentials after a transport failure", async () => {
    h.fetch.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(disconnectMeta("owner")).rejects.toThrow("could not be revoked");
    expect(h.set).not.toHaveBeenCalled();
  });

  it("clears local credentials only after Meta confirms success", async () => {
    h.fetch.mockResolvedValueOnce(new Response('{"success":true}', { status: 200 }));
    await disconnectMeta("owner");
    expect(h.fetch).toHaveBeenCalledWith(
      expect.stringContaining("graph.facebook.com"),
      { method: "DELETE" },
      10_000,
    );
    expect(h.set).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, accessToken: "", refreshToken: null }),
    );
  });

  it("allows an explicit local-only removal after a lost or ambiguous revoke", async () => {
    h.fetch.mockRejectedValueOnce(new Error("response lost"));
    await expect(disconnectMeta("owner-1")).rejects.toThrow("could not be revoked");
    expect(h.set).not.toHaveBeenCalled();
    await disconnectMetaLocally("owner-1");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.set).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, accessToken: "", refreshToken: null }),
    );
    const query = new PgDialect().sqlToQuery(h.where.mock.calls[0][0]);
    expect(query.params).toEqual(["owner-1", "meta"]);
  });
});
