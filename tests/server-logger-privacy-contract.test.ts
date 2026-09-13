import { describe, expect, it } from "vitest";
import { sanitizeLogFieldsForProduction } from "../src/lib/server-logger";

describe("production logger privacy", () => {
  it("redacts signed URLs and basic credentials in arbitrary diagnostic fields", () => {
    const safe = sanitizeLogFieldsForProduction({
      route: "/reset-password?token=fake_reset_secret&source=email",
      nested: [
        { stackTop: "at https://botbound.me/oauth-complete?code=fake_oauth_code:1:2" },
        { detail: "Basic ZmFrZTpmYWtl" },
      ],
    });
    const serialized = JSON.stringify(safe);
    for (const secret of ["fake_reset_secret", "fake_oauth_code", "ZmFrZTpmYWtl"]) {
      expect(serialized).not.toContain(secret);
    }
    expect(safe?.route).toContain("/reset-password?token=[REDACTED]&source=email");
  });

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

  it("preserves a real request correlation UUID while redacting tenant UUIDs", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(sanitizeLogFieldsForProduction({ requestId: id, userId: id })).toEqual({
      requestId: id,
      userId: "[redacted-id]",
    });
    expect(
      JSON.stringify(sanitizeLogFieldsForProduction({ requestId: "/path?token=fake_secret" })),
    ).not.toContain("fake_secret");
  });

  it("preserves operationally useful non-sensitive fields", () => {
    expect(
      sanitizeLogFieldsForProduction({ requestId: "req_123", status: 503, provider: "twilio" }),
    ).toEqual({ requestId: "req_123", status: 503, provider: "twilio" });
  });
});
