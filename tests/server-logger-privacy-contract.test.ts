import { describe, expect, it } from "vitest";
import { sanitizeLogFieldsForProduction } from "../src/lib/server-logger";

describe("production logger privacy", () => {
  it("redacts email addresses, credentials, and database query payloads recursively", () => {
    const sanitized = sanitizeLogFieldsForProduction({
      email: "founder@example.com",
      authorization: "Bearer secret-token",
      error:
        "Failed query: insert into wireline_users (email, password_hash) values ($1, $2)\nparams: founder@example.com,deadbeef",
      nested: {
        apiKey: "sk_live_do_not_log",
        message: "Contact founder@example.com",
      },
    });
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain("founder@example.com");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("sk_live_do_not_log");
    expect(serialized).not.toContain("deadbeef");
    expect(sanitized?.authorization).toBe("[redacted]");
    expect(sanitized?.error).toBe("Database operation failed [detail redacted]");
    expect(serialized).toContain("[redacted-email]");
  });

  it("preserves operationally useful non-sensitive fields", () => {
    expect(
      sanitizeLogFieldsForProduction({ requestId: "req_123", status: 503, provider: "twilio" }),
    ).toEqual({ requestId: "req_123", status: 503, provider: "twilio" });
  });
});
