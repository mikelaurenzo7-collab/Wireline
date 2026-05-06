// Tests for response/payload schemas. These guard the boundaries between
// the server and the database, and between the server and webhook receivers —
// mis-typing a status field would silently break delivery retry logic.

import { describe, it, expect, vi } from "vitest";
import {
  WebhookDeliverySchema,
  WebhookMetadataSchema,
  AgentSchema,
  APIErrorSchema,
  validateResponse,
} from "./schemas";

const NOW = new Date("2026-01-01T00:00:00.000Z").toISOString();
const UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("WebhookDeliverySchema", () => {
  const valid = {
    id: 1,
    user_id: UUID,
    webhook_id: "wh-1",
    event: "call.completed",
    payload: { foo: "bar" },
    attempts: 0,
    max_attempts: 5,
    status: "pending" as const,
    last_error: null,
    last_status_code: null,
    delivered_at: null,
    created_at: NOW,
    updated_at: NOW,
  };

  it("accepts a fully valid delivery row", () => {
    expect(WebhookDeliverySchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-UUID user_id", () => {
    expect(WebhookDeliverySchema.safeParse({ ...valid, user_id: "not-uuid" }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(WebhookDeliverySchema.safeParse({ ...valid, status: "stuck" }).success).toBe(false);
  });

  it("rejects negative attempt count", () => {
    expect(WebhookDeliverySchema.safeParse({ ...valid, attempts: -1 }).success).toBe(false);
  });

  it("rejects zero max_attempts (must be positive)", () => {
    expect(WebhookDeliverySchema.safeParse({ ...valid, max_attempts: 0 }).success).toBe(false);
  });

  it("strict mode rejects unknown fields to catch upstream schema drift", () => {
    expect(
      WebhookDeliverySchema.safeParse({ ...valid, unexpected_field: "x" }).success,
    ).toBe(false);
  });

  it("accepts each enum status value", () => {
    for (const status of ["pending", "success", "failed", "dead"] as const) {
      expect(WebhookDeliverySchema.safeParse({ ...valid, status }).success).toBe(true);
    }
  });

  it("accepts a delivered_at timestamp", () => {
    expect(
      WebhookDeliverySchema.safeParse({ ...valid, delivered_at: NOW, status: "success" }).success,
    ).toBe(true);
  });
});

describe("WebhookMetadataSchema", () => {
  const valid = {
    id: "wh-1",
    user_id: UUID,
    url: "https://hooks.example.com/wireline",
    active: true,
    delivery_count: 0,
    last_triggered_at: null,
    last_status: null,
    last_error: null,
    created_at: NOW,
    updated_at: NOW,
  };

  it("accepts a valid webhook config", () => {
    expect(WebhookMetadataSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a non-URL hook target", () => {
    expect(WebhookMetadataSchema.safeParse({ ...valid, url: "not a url" }).success).toBe(false);
  });

  it("optional secret is accepted when present", () => {
    expect(WebhookMetadataSchema.safeParse({ ...valid, secret: "shh" }).success).toBe(true);
  });
});

describe("AgentSchema", () => {
  const valid = {
    id: UUID,
    user_id: UUID,
    name: "Sales Bot",
    directives: [],
    knowledge: [],
    created_at: NOW,
    updated_at: NOW,
  };

  it("accepts a minimal agent", () => {
    expect(AgentSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults missing directives/knowledge to empty arrays via parse()", () => {
    const parsed = AgentSchema.parse({
      id: UUID,
      user_id: UUID,
      name: "B",
      created_at: NOW,
      updated_at: NOW,
    });
    expect(parsed.directives).toEqual([]);
    expect(parsed.knowledge).toEqual([]);
  });

  it("rejects names exceeding 100 chars", () => {
    expect(AgentSchema.safeParse({ ...valid, name: "x".repeat(101) }).success).toBe(false);
  });

  it("rejects non-UUID id", () => {
    expect(AgentSchema.safeParse({ ...valid, id: "abc" }).success).toBe(false);
  });
});

describe("APIErrorSchema", () => {
  it("accepts a minimal error", () => {
    expect(APIErrorSchema.safeParse({ error: "Something failed" }).success).toBe(true);
  });

  it("accepts optional code and details", () => {
    expect(
      APIErrorSchema.safeParse({
        error: "x",
        code: "ERR_X",
        details: { hint: "retry" },
      }).success,
    ).toBe(true);
  });

  it("rejects when error field is missing", () => {
    expect(APIErrorSchema.safeParse({}).success).toBe(false);
  });
});

describe("validateResponse", () => {
  it("returns the parsed data on valid input", () => {
    const r = validateResponse(APIErrorSchema, { error: "boom" });
    expect(r.error).toBe("boom");
  });

  it("throws a helpful Error containing the first issue's message", () => {
    expect(() => validateResponse(APIErrorSchema, {})).toThrow(/Invalid response/);
  });

  it("rethrows non-Zod errors as-is", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const brokenSchema = {
      parse: () => {
        throw new TypeError("internal");
      },
    } as any;
    expect(() => validateResponse(brokenSchema, {})).toThrow(TypeError);
    expect(() => validateResponse(brokenSchema, {})).toThrow("internal");
    consoleSpy.mockRestore();
  });
});
