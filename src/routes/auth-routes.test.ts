import { describe, expect, it } from "vitest";
import { getPostgresErrorCode } from "../lib/pg-errors";

describe("auth signup error handling", () => {
  it("maps nested unique violations to EMAIL_TAKEN via pg code", () => {
    const err = {
      message: "Failed query: insert into wireline_users",
      cause: {
        message: 'duplicate key value violates unique constraint "wireline_users_email_key"',
        code: "23505",
      },
    };
    expect(getPostgresErrorCode(err)).toBe("23505");
  });
});
