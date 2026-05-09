/**
 * Intake API contracts.
 *
 * Mirrors the key validation, rate-limiting, idempotency, and
 * lead-processing logic from server.ts without importing the module.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mirror resolveIntakeKey logic ────────────────────────────────────────────
const INTAKE_KEY_PREFIX = "wlk_";

async function sha256Hex(value: string): Promise<string> {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(value).digest("hex");
}

type IntakeKey = {
  id: string;
  user_id: string;
  name: string;
  default_agent_id: string | null;
  active: boolean;
  use_count: number;
  auto_dial: boolean;
};

async function resolveIntakeKey(
  provided: string | undefined,
  lookupByHash: (hash: string) => Promise<IntakeKey | null>,
): Promise<IntakeKey | null> {
  if (!provided || typeof provided !== "string" || !provided.startsWith(INTAKE_KEY_PREFIX)) return null;
  const hash = await sha256Hex(provided.trim());
  const data = await lookupByHash(hash);
  if (!data || !data.active) return null;
  return data;
}

// ── Mirror checkIntakeRate logic ──────────────────────────────────────────────
const INTAKE_RATE_WINDOW_MS = 60_000;
const INTAKE_RATE_MAX = 60;

function makeRateLimiter() {
  const buckets = new Map<string, number[]>();
  return function checkIntakeRate(keyId: string, now = Date.now()): { ok: boolean; retry_after_s?: number } {
    const cutoff = now - INTAKE_RATE_WINDOW_MS;
    const hits = (buckets.get(keyId) || []).filter(t => t > cutoff);
    if (hits.length >= INTAKE_RATE_MAX) {
      const retryAfter = Math.max(1, Math.ceil((hits[0] + INTAKE_RATE_WINDOW_MS - now) / 1000));
      buckets.set(keyId, hits);
      return { ok: false, retry_after_s: retryAfter };
    }
    hits.push(now);
    buckets.set(keyId, hits);
    return { ok: true };
  };
}

// ── Mirror processIntakeLead logic ────────────────────────────────────────────
type IntakeLeadInput = {
  customer_number?: string;
  phone?: string;
  customer_name?: string;
  idempotency_key?: string;
  agent_id?: string;
  auto_dial?: boolean;
};

type IntakeLeadResult = {
  ok: boolean;
  lead_id?: number;
  status?: string;
  call_id?: string | null;
  idempotent_replay?: boolean;
  auto_dial_initiated?: boolean;
  error?: string;
  code?: string;
};

async function processIntakeLead(
  key: IntakeKey,
  input: IntakeLeadInput,
  idemHeaderOverride: string | null | undefined,
  db: {
    findByIdempotencyKey: (userId: string, idemKey: string) => Promise<{ id: number; call_id: string | null; status: string } | null>;
    insertLead: (data: any) => Promise<{ id: number } | null>;
  },
): Promise<IntakeLeadResult> {
  const customer_number = (input.customer_number || input.phone || "").toString().trim();
  if (!customer_number) {
    return { ok: false, error: "customer_number (or phone) is required.", code: "MISSING_NUMBER" };
  }

  const PHONE_RE = /^\+?[0-9]{7,20}$/;
  const phoneClean = customer_number.replace(/[\s\-().]/g, "");
  if (!PHONE_RE.test(phoneClean)) {
    return { ok: false, error: "customer_number must be a valid phone number (7–20 digits, optional leading +).", code: "INVALID_NUMBER" };
  }

  const idemKey = idemHeaderOverride !== undefined ? idemHeaderOverride : (input.idempotency_key || null);
  const idemKeyTrimmed = idemKey ? String(idemKey).trim().slice(0, 255) : null;

  if (idemKeyTrimmed) {
    const existing = await db.findByIdempotencyKey(key.user_id, idemKeyTrimmed);
    if (existing) {
      return {
        ok: true,
        lead_id: existing.id,
        idempotent_replay: true,
        status: existing.status,
        call_id: existing.call_id,
        auto_dial_initiated: false,
      };
    }
  }

  const inserted = await db.insertLead({
    user_id: key.user_id,
    customer_number,
    customer_name: input.customer_name || null,
    idempotency_key: idemKeyTrimmed,
  });

  if (!inserted) {
    return { ok: false, error: "DB insert failed", code: "INSERT_FAILED" };
  }

  const agent_id = input.agent_id || key.default_agent_id || null;
  const auto_dial_initiated = !!(key.auto_dial && agent_id);

  return {
    ok: true,
    lead_id: inserted.id,
    idempotent_replay: false,
    auto_dial_initiated,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────
const VALID_KEY_ROW: IntakeKey = {
  id: "key-abc",
  user_id: "user-xyz",
  name: "Webflow Form",
  default_agent_id: null,
  active: true,
  use_count: 0,
  auto_dial: false,
};
const VALID_KEY_PLAINTEXT = "wlk_abcdefghijklmnopqrstuvwxyz123456";

const mockLookupByHash = vi.fn<(hash: string) => Promise<IntakeKey | null>>();
const mockFindByIdempotencyKey = vi.fn<(userId: string, idemKey: string) => Promise<{ id: number; call_id: string | null; status: string } | null>>();
const mockInsertLead = vi.fn<(data: any) => Promise<{ id: number } | null>>();
const mockDb = { findByIdempotencyKey: mockFindByIdempotencyKey, insertLead: mockInsertLead };

beforeEach(() => {
  mockLookupByHash.mockReset();
  mockFindByIdempotencyKey.mockReset();
  mockInsertLead.mockReset();
  mockInsertLead.mockResolvedValue({ id: 1001 });
  mockFindByIdempotencyKey.mockResolvedValue(null);
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("resolveIntakeKey", () => {
  it("returns null when header is missing", async () => {
    expect(await resolveIntakeKey(undefined, mockLookupByHash)).toBeNull();
    expect(mockLookupByHash).not.toHaveBeenCalled();
  });

  it("returns null when header has wrong prefix", async () => {
    expect(await resolveIntakeKey("sk_live_xxx", mockLookupByHash)).toBeNull();
    expect(mockLookupByHash).not.toHaveBeenCalled();
  });

  it("returns null when lookup returns no match", async () => {
    mockLookupByHash.mockResolvedValue(null);
    expect(await resolveIntakeKey(VALID_KEY_PLAINTEXT, mockLookupByHash)).toBeNull();
  });

  it("returns null when key is inactive", async () => {
    mockLookupByHash.mockResolvedValue({ ...VALID_KEY_ROW, active: false });
    expect(await resolveIntakeKey(VALID_KEY_PLAINTEXT, mockLookupByHash)).toBeNull();
  });

  it("returns the key row for a valid active key", async () => {
    mockLookupByHash.mockResolvedValue(VALID_KEY_ROW);
    const result = await resolveIntakeKey(VALID_KEY_PLAINTEXT, mockLookupByHash);
    expect(result).toEqual(VALID_KEY_ROW);
    expect(mockLookupByHash).toHaveBeenCalledTimes(1);
  });

  it("looks up by SHA-256 hash of the trimmed plaintext key (trailing whitespace stripped)", async () => {
    mockLookupByHash.mockResolvedValue(VALID_KEY_ROW);
    // Only trailing spaces — leading spaces would fail the prefix check before trimming.
    await resolveIntakeKey(`${VALID_KEY_PLAINTEXT}  `, mockLookupByHash);
    const { createHash } = await import("node:crypto");
    const expectedHash = createHash("sha256").update(VALID_KEY_PLAINTEXT).digest("hex");
    expect(mockLookupByHash).toHaveBeenCalledWith(expectedHash);
  });
});

describe("checkIntakeRate", () => {
  it("allows requests under the limit", () => {
    const check = makeRateLimiter();
    for (let i = 0; i < INTAKE_RATE_MAX; i++) {
      expect(check("key-1").ok).toBe(true);
    }
  });

  it("returns ok:false when the limit is reached", () => {
    const check = makeRateLimiter();
    const t = Date.now();
    for (let i = 0; i < INTAKE_RATE_MAX; i++) check("key-1", t + i);
    const result = check("key-1", t + INTAKE_RATE_MAX);
    expect(result.ok).toBe(false);
    expect(result.retry_after_s).toBeGreaterThanOrEqual(1);
  });

  it("rate-limits per key independently", () => {
    const check = makeRateLimiter();
    const t = Date.now();
    for (let i = 0; i < INTAKE_RATE_MAX; i++) check("key-A", t + i);
    expect(check("key-B").ok).toBe(true);
  });

  it("allows requests again after the window expires", () => {
    const check = makeRateLimiter();
    const t = Date.now();
    for (let i = 0; i < INTAKE_RATE_MAX; i++) check("key-1", t + i);
    // Advance past the window
    const future = t + INTAKE_RATE_WINDOW_MS + 1000;
    expect(check("key-1", future).ok).toBe(true);
  });
});

describe("processIntakeLead — input validation", () => {
  it("returns MISSING_NUMBER when customer_number is absent", async () => {
    const result = await processIntakeLead(VALID_KEY_ROW, {}, null, mockDb);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MISSING_NUMBER");
  });

  it("accepts 'phone' as an alias for customer_number", async () => {
    const result = await processIntakeLead(VALID_KEY_ROW, { phone: "+15551234567" }, null, mockDb);
    expect(result.ok).toBe(true);
    expect(result.lead_id).toBe(1001);
  });

  it("rejects a non-phone string with INVALID_NUMBER", async () => {
    const result = await processIntakeLead(VALID_KEY_ROW, { customer_number: "not-a-phone" }, null, mockDb);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_NUMBER");
  });

  it("accepts valid E.164 number", async () => {
    const result = await processIntakeLead(VALID_KEY_ROW, { customer_number: "+15551234567" }, null, mockDb);
    expect(result.ok).toBe(true);
  });

  it("accepts number with common separators (stripped before validation)", async () => {
    const result = await processIntakeLead(VALID_KEY_ROW, { customer_number: "(555) 123-4567" }, null, mockDb);
    expect(result.ok).toBe(true);
  });
});

describe("processIntakeLead — idempotency", () => {
  it("returns the original lead_id with idempotent_replay:true on duplicate idem key", async () => {
    mockFindByIdempotencyKey.mockResolvedValue({ id: 999, call_id: null, status: "Pending" });
    // Pass undefined (not null) so processIntakeLead falls back to the body's idempotency_key.
    // null means "header was present but empty" — undefined means "no header, use body".
    const result = await processIntakeLead(
      VALID_KEY_ROW,
      { customer_number: "+15551234567", idempotency_key: "req-001" },
      undefined,
      mockDb,
    );
    expect(result.ok).toBe(true);
    expect(result.lead_id).toBe(999);
    expect(result.idempotent_replay).toBe(true);
    expect(mockInsertLead).not.toHaveBeenCalled();
  });

  it("idem key from header overrides body idempotency_key", async () => {
    mockFindByIdempotencyKey.mockResolvedValue(null);
    await processIntakeLead(
      VALID_KEY_ROW,
      { customer_number: "+15551234567", idempotency_key: "from-body" },
      "from-header",
      mockDb,
    );
    expect(mockFindByIdempotencyKey).toHaveBeenCalledWith(VALID_KEY_ROW.user_id, "from-header");
  });

  it("inserts a new lead when no idempotency key is given", async () => {
    const result = await processIntakeLead(VALID_KEY_ROW, { customer_number: "+15551234567" }, null, mockDb);
    expect(result.ok).toBe(true);
    expect(result.idempotent_replay).toBe(false);
    expect(mockInsertLead).toHaveBeenCalledTimes(1);
  });
});

describe("processIntakeLead — auto-dial", () => {
  it("sets auto_dial_initiated:true when key.auto_dial is true and agent_id is available", async () => {
    const keyWithDial: IntakeKey = { ...VALID_KEY_ROW, auto_dial: true, default_agent_id: "agent-001" };
    const result = await processIntakeLead(keyWithDial, { customer_number: "+15551234567" }, null, mockDb);
    expect(result.auto_dial_initiated).toBe(true);
  });

  it("does not auto-dial when auto_dial is true but no agent is available", async () => {
    const keyWithDial: IntakeKey = { ...VALID_KEY_ROW, auto_dial: true, default_agent_id: null };
    const result = await processIntakeLead(keyWithDial, { customer_number: "+15551234567" }, null, mockDb);
    expect(result.auto_dial_initiated).toBe(false);
  });

  it("does not auto-dial when key.auto_dial is false", async () => {
    const result = await processIntakeLead(
      { ...VALID_KEY_ROW, auto_dial: false, default_agent_id: "agent-001" },
      { customer_number: "+15551234567" },
      null,
      mockDb,
    );
    expect(result.auto_dial_initiated).toBe(false);
  });
});

describe("processIntakeLead — DB failure", () => {
  it("returns INSERT_FAILED when the DB insert returns null", async () => {
    mockInsertLead.mockResolvedValue(null);
    const result = await processIntakeLead(VALID_KEY_ROW, { customer_number: "+15551234567" }, null, mockDb);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INSERT_FAILED");
  });
});
