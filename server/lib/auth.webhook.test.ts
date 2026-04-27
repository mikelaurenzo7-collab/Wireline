import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-secret-test-secret-test-secret";

// `hasValidWebhookSecret` reads `env.*` at module-load time (via the
// imported `./env`). To exercise different env configurations we re-mock
// and re-import `./auth` per test.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mod: typeof import("./auth");

async function loadAuthWith(envOverrides: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock("./env", () => ({
    env: {
      // Supabase fields are required because `./auth` transitively imports
      // `./supabase`, which throws at module-load if neither key is set.
      VITE_SUPABASE_URL: "https://test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
      WIRELINE_WEBHOOK_SECRET: SECRET,
      WEBHOOK_TIMESTAMP_TOLERANCE_SEC: 300,
      ...envOverrides,
    },
    isProductionEnv: () => false,
    getRequiredEnv: (name: string) => {
      throw new Error(`getRequiredEnv called for ${name}`);
    },
  }));
  mod = await import("./auth");
}

beforeEach(async () => {
  await loadAuthWith({});
});

afterEach(() => {
  vi.resetModules();
});

// Minimal `Request`-shaped fixture. We only ever exercise the few fields
// `hasValidWebhookSecret` reads (`get(headerName)` and `rawBody`).
function makeReq(headers: Record<string, string>, rawBody?: Buffer) {
  return {
    get(name: string) {
      return headers[name.toLowerCase()];
    },
    rawBody,
    headers,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("hasValidWebhookSecret", () => {
  const body = Buffer.from(JSON.stringify({ message: { type: "ping" } }));
  const ts = Math.floor(Date.now() / 1000).toString();

  it("accepts a valid HMAC signature within the replay window", () => {
    const sig = createHmac("sha256", SECRET).update(ts).update(".").update(body).digest("hex");
    const req = makeReq(
      { "x-vapi-signature": `sha256=${sig}`, "x-vapi-timestamp": ts },
      body
    );
    expect(mod.hasValidWebhookSecret(req)).toBe(true);
  });

  it("accepts a bare-hex signature (without sha256= prefix)", () => {
    const sig = createHmac("sha256", SECRET).update(ts).update(".").update(body).digest("hex");
    const req = makeReq({ "x-vapi-signature": sig, "x-vapi-timestamp": ts }, body);
    expect(mod.hasValidWebhookSecret(req)).toBe(true);
  });

  it("rejects a tampered body even with a fresh timestamp", () => {
    const sig = createHmac("sha256", SECRET).update(ts).update(".").update(body).digest("hex");
    const tampered = Buffer.from('{"message":{"type":"evil"}}');
    const req = makeReq(
      { "x-vapi-signature": `sha256=${sig}`, "x-vapi-timestamp": ts },
      tampered
    );
    expect(mod.hasValidWebhookSecret(req)).toBe(false);
  });

  it("rejects a stale timestamp outside the replay window", () => {
    const stale = (Math.floor(Date.now() / 1000) - 60 * 60).toString();
    const sig = createHmac("sha256", SECRET).update(stale).update(".").update(body).digest("hex");
    const req = makeReq(
      { "x-vapi-signature": `sha256=${sig}`, "x-vapi-timestamp": stale },
      body
    );
    expect(mod.hasValidWebhookSecret(req)).toBe(false);
  });

  it("rejects a non-numeric timestamp without doing HMAC work", () => {
    const req = makeReq(
      { "x-vapi-signature": "sha256=deadbeef", "x-vapi-timestamp": "not-a-number" },
      body
    );
    expect(mod.hasValidWebhookSecret(req)).toBe(false);
  });

  it("rejects when the raw body was not captured", () => {
    const sig = createHmac("sha256", SECRET).update(ts).update(".").update(body).digest("hex");
    const req = makeReq({
      "x-vapi-signature": `sha256=${sig}`,
      "x-vapi-timestamp": ts,
    });
    expect(mod.hasValidWebhookSecret(req)).toBe(false);
  });

  it("falls back to the legacy shared-secret header", () => {
    const req = makeReq({ "x-vapi-secret": SECRET });
    expect(mod.hasValidWebhookSecret(req)).toBe(true);
  });

  it("rejects a wrong shared secret in constant time", () => {
    const req = makeReq({ "x-vapi-secret": "nope-nope-nope-nope-nope-nope" });
    expect(mod.hasValidWebhookSecret(req)).toBe(false);
  });

  it("rejects when no secret is configured", async () => {
    await loadAuthWith({ WIRELINE_WEBHOOK_SECRET: undefined });
    const req = makeReq({ "x-vapi-secret": SECRET });
    expect(mod.hasValidWebhookSecret(req)).toBe(false);
  });

  it("rejects a non-hex signature", () => {
    const req = makeReq(
      { "x-vapi-signature": "sha256=not-hex!!", "x-vapi-timestamp": ts },
      body
    );
    expect(mod.hasValidWebhookSecret(req)).toBe(false);
  });
});

