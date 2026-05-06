// Tests for server-side pure utilities. The sanitizer in particular
// is the last line of defense against credential leakage into audit logs.

import { describe, it, expect, vi } from "vitest";
import { getErrorMessage, sanitizeForAudit, ownsRow } from "./server-utils";

describe("getErrorMessage", () => {
  it("extracts the message from a real Error instance", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns the string itself when a string is thrown", () => {
    expect(getErrorMessage("plain string error")).toBe("plain string error");
  });

  it("stringifies unknown objects safely", () => {
    expect(getErrorMessage({ code: 500 })).toContain("[object");
  });

  it("handles null without crashing", () => {
    expect(getErrorMessage(null)).toBe("null");
  });

  it("handles undefined without crashing", () => {
    expect(getErrorMessage(undefined)).toBe("undefined");
  });

  it("preserves the message of subclassed Error types", () => {
    class CustomError extends Error {}
    expect(getErrorMessage(new CustomError("custom"))).toBe("custom");
  });

  it("handles thrown numbers", () => {
    expect(getErrorMessage(42)).toBe("42");
  });
});

describe("sanitizeForAudit — primitives", () => {
  it("passes through primitives untouched", () => {
    expect(sanitizeForAudit("foo")).toBe("foo");
    expect(sanitizeForAudit(42)).toBe(42);
    expect(sanitizeForAudit(true)).toBe(true);
    expect(sanitizeForAudit(null)).toBe(null);
    expect(sanitizeForAudit(undefined)).toBe(undefined);
  });
});

describe("sanitizeForAudit — sensitive key redaction", () => {
  it("redacts api_key", () => {
    const r = sanitizeForAudit({ api_key: "sk-secret" }) as any;
    expect(r.api_key).toBe("[REDACTED]");
  });

  it("redacts password", () => {
    const r = sanitizeForAudit({ password: "hunter2" }) as any;
    expect(r.password).toBe("[REDACTED]");
  });

  it("redacts token", () => {
    const r = sanitizeForAudit({ access_token: "ya29.AAA" }) as any;
    expect(r.access_token).toBe("[REDACTED]");
  });

  it("redacts secret", () => {
    const r = sanitizeForAudit({ client_secret: "s" }) as any;
    expect(r.client_secret).toBe("[REDACTED]");
  });

  it("redacts credential", () => {
    const r = sanitizeForAudit({ aws_credentials: "x" }) as any;
    expect(r.aws_credentials).toBe("[REDACTED]");
  });

  it("redacts auth-prefixed keys", () => {
    const r = sanitizeForAudit({ authorization: "Bearer xyz" }) as any;
    expect(r.authorization).toBe("[REDACTED]");
  });

  it("matches case-insensitively", () => {
    const r = sanitizeForAudit({ API_KEY: "x", Password: "y", AuthToken: "z" }) as any;
    expect(r.API_KEY).toBe("[REDACTED]");
    expect(r.Password).toBe("[REDACTED]");
    expect(r.AuthToken).toBe("[REDACTED]");
  });
});

describe("sanitizeForAudit — non-sensitive fields preserved", () => {
  it("preserves typical user fields", () => {
    const r = sanitizeForAudit({
      email: "u@example.com",
      name: "User",
      id: "u-1",
    }) as any;
    expect(r).toEqual({ email: "u@example.com", name: "User", id: "u-1" });
  });

  it("does NOT redact harmless field names containing none of the patterns", () => {
    const r = sanitizeForAudit({ phone_number: "555", agent_id: "a-1" }) as any;
    expect(r.phone_number).toBe("555");
    expect(r.agent_id).toBe("a-1");
  });
});

describe("sanitizeForAudit — nested objects", () => {
  it("recursively redacts nested sensitive fields", () => {
    const input = {
      user: {
        email: "u@example.com",
        credentials: {
          password: "hunter2",
          api_key: "sk-xxx",
        },
      },
    };
    const r = sanitizeForAudit(input) as any;
    expect(r.user.email).toBe("u@example.com");
    expect(r.user.credentials).toBe("[REDACTED]");
  });

  it("redacts sensitive fields inside otherwise-safe parents", () => {
    const r = sanitizeForAudit({
      profile: { name: "Alice", auth_token: "secret" },
    }) as any;
    expect(r.profile.name).toBe("Alice");
    expect(r.profile.auth_token).toBe("[REDACTED]");
  });

  it("does not mutate the original object", () => {
    const original = { password: "hunter2", email: "u@example.com" };
    sanitizeForAudit(original);
    expect(original.password).toBe("hunter2");
  });
});

describe("sanitizeForAudit — arrays", () => {
  it("preserves array structure (not coerced to object)", () => {
    const r = sanitizeForAudit([1, 2, 3]);
    expect(Array.isArray(r)).toBe(true);
    expect(r).toEqual([1, 2, 3]);
  });

  it("recursively sanitizes objects inside arrays", () => {
    const r = sanitizeForAudit([
      { email: "a@x.com", password: "p1" },
      { email: "b@x.com", password: "p2" },
    ]) as any[];
    expect(r[0].password).toBe("[REDACTED]");
    expect(r[1].password).toBe("[REDACTED]");
    expect(r[0].email).toBe("a@x.com");
  });
});

describe("sanitizeForAudit — edge cases", () => {
  it("handles deeply nested sensitive fields", () => {
    const r = sanitizeForAudit({
      a: { b: { c: { d: { secret_key: "leaked" } } } },
    }) as any;
    expect(r.a.b.c.d.secret_key).toBe("[REDACTED]");
  });

  it("handles empty objects", () => {
    expect(sanitizeForAudit({})).toEqual({});
  });

  it("handles empty arrays", () => {
    expect(sanitizeForAudit([])).toEqual([]);
  });
});

describe("ownsRow", () => {
  function makeDb(returnedData: unknown) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: returnedData });
    const eqUser = vi.fn().mockReturnValue({ maybeSingle });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ select });
    return { from, select, eqId, eqUser, maybeSingle };
  }

  it("returns true when the row exists and belongs to the user", async () => {
    const db = makeDb({ id: "agent-1" });
    const result = await ownsRow(db, "wireline_agents", "agent-1", "user-1");
    expect(result).toBe(true);
  });

  it("returns false when the row is null (not found, or owned by someone else)", async () => {
    const db = makeDb(null);
    const result = await ownsRow(db, "wireline_agents", "agent-1", "user-2");
    expect(result).toBe(false);
  });

  it("queries the named table", async () => {
    const db = makeDb({ id: "x" });
    await ownsRow(db, "wireline_phone_numbers", "p-1", "u-1");
    expect(db.from).toHaveBeenCalledWith("wireline_phone_numbers");
  });

  it("filters by both id and user_id (the security invariant)", async () => {
    const db = makeDb({ id: "x" });
    await ownsRow(db, "wireline_agents", "a-1", "u-1");
    expect(db.eqId).toHaveBeenCalledWith("id", "a-1");
    expect(db.eqUser).toHaveBeenCalledWith("user_id", "u-1");
  });

  it("works with numeric ids (integer primary keys)", async () => {
    const db = makeDb({ id: 42 });
    const result = await ownsRow(db, "wireline_webhook_deliveries", 42, "u-1");
    expect(result).toBe(true);
    expect(db.eqId).toHaveBeenCalledWith("id", 42);
  });
});
