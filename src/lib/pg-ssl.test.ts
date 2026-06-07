import { afterEach, describe, expect, it } from "vitest";
import { resolvePgSsl } from "./pg-ssl";

describe("resolvePgSsl", () => {
  const ORIGINAL_PGSSLMODE = process.env.PGSSLMODE;

  afterEach(() => {
    if (ORIGINAL_PGSSLMODE === undefined) delete process.env.PGSSLMODE;
    else process.env.PGSSLMODE = ORIGINAL_PGSSLMODE;
  });

  it("negotiates TLS without strict cert verification for managed hosts", () => {
    delete process.env.PGSSLMODE;
    expect(
      resolvePgSsl(
        "postgresql://postgres.abc:pw@aws-1-us-east-2.pooler.supabase.com:6543/postgres",
      ),
    ).toEqual({ rejectUnauthorized: false });
  });

  it("disables SSL for localhost connections", () => {
    delete process.env.PGSSLMODE;
    expect(resolvePgSsl("postgresql://postgres:pw@localhost:5432/wireline")).toBe(false);
    expect(resolvePgSsl("postgresql://postgres:pw@127.0.0.1:5432/wireline")).toBe(false);
  });

  it("honors PGSSLMODE=disable for any host", () => {
    process.env.PGSSLMODE = "disable";
    expect(
      resolvePgSsl(
        "postgresql://postgres.abc:pw@aws-1-us-east-2.pooler.supabase.com:6543/postgres",
      ),
    ).toBe(false);
  });

  it("defaults to TLS when the connection string is empty", () => {
    delete process.env.PGSSLMODE;
    expect(resolvePgSsl("")).toEqual({ rejectUnauthorized: false });
  });
});
