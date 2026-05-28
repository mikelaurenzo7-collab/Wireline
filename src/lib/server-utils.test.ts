import { describe, it, expect } from "vitest";
import {
  getErrorMessage,
  sanitizeForAudit,
  mapObjectToCamel,
  mapObjectToSnake,
} from "./server-utils";

describe("getErrorMessage", () => {
  it("extracts .message from an Error instance", () => {
    expect(getErrorMessage(new Error("something broke"))).toBe("something broke");
  });

  it("returns string inputs unchanged", () => {
    expect(getErrorMessage("plain string error")).toBe("plain string error");
    expect(getErrorMessage("")).toBe("");
  });

  it("coerces non-string, non-Error values via String()", () => {
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(null)).toBe("null");
    expect(getErrorMessage(undefined)).toBe("undefined");
    expect(getErrorMessage(false)).toBe("false");
  });

  it("coerces objects to [object Object]", () => {
    expect(getErrorMessage({ code: 5 })).toBe("[object Object]");
  });

  it("handles Error subclasses", () => {
    const err = new TypeError("bad type");
    expect(getErrorMessage(err)).toBe("bad type");
  });
});

describe("sanitizeForAudit", () => {
  it("passes through primitives unchanged", () => {
    expect(sanitizeForAudit("hello")).toBe("hello");
    expect(sanitizeForAudit(42)).toBe(42);
    expect(sanitizeForAudit(null)).toBeNull();
    expect(sanitizeForAudit(true)).toBe(true);
  });

  it("redacts all sensitive key patterns", () => {
    const input = {
      api_key: "abc123",
      secret: "s3cr3t",
      password: "hunter2",
      access_token: "tok",
      refreshToken: "ref",
      credential: "cred",
      authHeader: "Bearer xyz",
    };
    const result = sanitizeForAudit(input) as Record<string, unknown>;
    for (const key of Object.keys(input)) {
      expect(result[key]).toBe("[REDACTED]");
    }
  });

  it("preserves non-sensitive fields", () => {
    const result = sanitizeForAudit({ userId: "u1", email: "a@b.com", amount: 5 });
    expect(result).toEqual({ userId: "u1", email: "a@b.com", amount: 5 });
  });

  it("is case-insensitive on pattern matching", () => {
    const result = sanitizeForAudit({ API_KEY: "x", PASSWORD: "y", SecretValue: "z" }) as any;
    expect(result.API_KEY).toBe("[REDACTED]");
    expect(result.PASSWORD).toBe("[REDACTED]");
    expect(result.SecretValue).toBe("[REDACTED]");
  });

  it("recurses into nested objects", () => {
    const result = sanitizeForAudit({ outer: { inner: { secret: "s", name: "Alice" } } }) as any;
    expect(result.outer.inner.secret).toBe("[REDACTED]");
    expect(result.outer.inner.name).toBe("Alice");
  });

  it("recurses into arrays", () => {
    const result = sanitizeForAudit([{ password: "x" }, { name: "y" }]) as any[];
    expect(result[0].password).toBe("[REDACTED]");
    expect(result[1].name).toBe("y");
  });

  it("does not mutate the original input", () => {
    const input = { password: "secret", name: "Alice" };
    sanitizeForAudit(input);
    expect(input.password).toBe("secret");
  });

  it("returns an empty object for an empty input object", () => {
    expect(sanitizeForAudit({})).toEqual({});
  });
});

describe("mapObjectToCamel", () => {
  it("converts snake_case keys to camelCase", () => {
    expect(mapObjectToCamel({ customer_name: "Alice", agent_id: "a1" })).toEqual({
      customerName: "Alice",
      agentId: "a1",
    });
  });

  it("leaves already-camelCase keys unchanged", () => {
    expect(mapObjectToCamel({ alreadyCamel: true })).toEqual({ alreadyCamel: true });
  });

  it("recurses into nested objects", () => {
    expect(mapObjectToCamel({ outer_key: { inner_field: 1 } })).toEqual({
      outerKey: { innerField: 1 },
    });
  });

  it("recurses into arrays", () => {
    expect(mapObjectToCamel([{ my_key: 1 }, { other_key: 2 }])).toEqual([
      { myKey: 1 },
      { otherKey: 2 },
    ]);
  });

  it("handles multi-word snake_case", () => {
    expect(mapObjectToCamel({ created_at_utc: "x" })).toEqual({ createdAtUtc: "x" });
  });

  it("passes through null and primitive values", () => {
    expect(mapObjectToCamel(null)).toBeNull();
    expect(mapObjectToCamel(42)).toBe(42);
    expect(mapObjectToCamel("hello")).toBe("hello");
  });
});

describe("mapObjectToSnake", () => {
  it("converts camelCase keys to snake_case", () => {
    expect(mapObjectToSnake({ customerName: "Alice", agentId: "a1" })).toEqual({
      customer_name: "Alice",
      agent_id: "a1",
    });
  });

  it("leaves already-snake_case keys unchanged", () => {
    expect(mapObjectToSnake({ already_snake: true })).toEqual({ already_snake: true });
  });

  it("serializes Date values to ISO strings", () => {
    const d = new Date("2026-01-15T10:00:00.000Z");
    expect(mapObjectToSnake(d)).toBe("2026-01-15T10:00:00.000Z");
  });

  it("serializes Date values inside objects", () => {
    const d = new Date("2026-01-15T10:00:00.000Z");
    expect(mapObjectToSnake({ createdAt: d })).toEqual({
      created_at: "2026-01-15T10:00:00.000Z",
    });
  });

  it("coerces BigInt values to string", () => {
    // Use BigInt("...") with a string literal — the numeric literal form
    // rounds at the Number.MAX_SAFE_INTEGER boundary before BigInt sees it.
    expect(mapObjectToSnake(BigInt("9007199254740993"))).toBe("9007199254740993");
  });

  it("coerces BigInt values inside objects", () => {
    expect(mapObjectToSnake({ leadId: BigInt(42) })).toEqual({ lead_id: "42" });
  });

  it("recurses into nested objects", () => {
    expect(mapObjectToSnake({ outerKey: { innerField: 1 } })).toEqual({
      outer_key: { inner_field: 1 },
    });
  });

  it("recurses into arrays", () => {
    expect(mapObjectToSnake([{ myKey: 1 }, { otherKey: 2 }])).toEqual([
      { my_key: 1 },
      { other_key: 2 },
    ]);
  });

  it("handles null and undefined without throwing", () => {
    expect(mapObjectToSnake(null)).toBeNull();
    expect(mapObjectToSnake(undefined)).toBeUndefined();
  });

  it("handles primitive values directly", () => {
    expect(mapObjectToSnake(42)).toBe(42);
    expect(mapObjectToSnake("hello")).toBe("hello");
  });
});
