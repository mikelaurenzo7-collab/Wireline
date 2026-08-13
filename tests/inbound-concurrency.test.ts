import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

beforeEach(() => {
  vi.resetModules();
  delete process.env.WIRELINE_INBOUND_CONCURRENT_CALL_CEILING;
});

async function loadModule(liveCount: number | Error) {
  vi.doMock("../src/lib/server-context", () => ({
    drizzle: {
      select: vi.fn(() => ({
        from: () => ({
          where: async () => {
            if (liveCount instanceof Error) throw liveCount;
            return [{ live: String(liveCount) }];
          },
        }),
      })),
    },
    log: { error: vi.fn(), warn: vi.fn() },
  }));
  return import("../src/lib/inbound-concurrency");
}

describe("inbound concurrency ceiling", () => {
  it("admits below the ceiling", async () => {
    const { inboundConcurrencyExceeded } = await loadModule(3);
    expect(await inboundConcurrencyExceeded("user-1")).toBe(false);
  });

  it("refuses at the ceiling", async () => {
    const { inboundConcurrencyExceeded } = await loadModule(10);
    expect(await inboundConcurrencyExceeded("user-1")).toBe(true);
  });

  it("honors the env override", async () => {
    process.env.WIRELINE_INBOUND_CONCURRENT_CALL_CEILING = "3";
    const { inboundConcurrencyExceeded } = await loadModule(3);
    expect(await inboundConcurrencyExceeded("user-1")).toBe(true);
  });

  it("fails open on a count error — a DB blip must not degrade the line", async () => {
    const { inboundConcurrencyExceeded } = await loadModule(new Error("pool timeout"));
    expect(await inboundConcurrencyExceeded("user-1")).toBe(false);
  });
});

describe("inbound concurrency wiring contract", () => {
  const vapi = read("src/routes/vapi-v2.ts");
  const lib = read("src/lib/inbound-concurrency.ts");

  it("gates after grace, before the full assistant, degrading to take-a-message", () => {
    const graceGate = vapi.indexOf("INBOUND_TAKE_MESSAGE_GRACE_USD = 5");
    const ceilingGate = vapi.indexOf("await inboundConcurrencyExceeded(agent.user_id)");
    const fullAssistant = vapi.indexOf("assistant: await buildVapiAssistant({");
    expect(graceGate).toBeGreaterThan(-1);
    expect(ceilingGate).toBeGreaterThan(graceGate);
    expect(ceilingGate).toBeLessThan(fullAssistant);
    // Overflow reuses the bounded assistant, never a hangup or an error body.
    const overflowBranch = vapi.slice(ceilingGate, fullAssistant);
    expect(overflowBranch).toContain("buildDurableTakeMessageAssistant(");
  });

  it("only counts fresh presence so a lost end-webhook cannot wedge the line", () => {
    expect(lib).toContain("PRESENCE_STALENESS_MS");
    expect(lib).toContain("gte(schema.signalPresence.startedAt, freshSince)");
  });
});
