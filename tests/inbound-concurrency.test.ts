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
  it("gates OpenAI inbound overflow to take-a-message before the accepted session", () => {
    const admission = read("src/lib/voice/native-inbound-admission.ts");
    const routes = read("src/routes/openai-sip-routes.ts");
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(admission).toContain("INBOUND_TAKE_MESSAGE_GRACE_USD = 5");
    expect(admission).toContain("inboundConcurrencyExceeded");
    expect(admission).toContain("voice_minutes_daily");
    expect(admission).toContain("after_hours");
    expect(admission).toContain("isWithinBusinessHours");
    expect(routes).toContain("resolveNativeInboundAdmission");
    expect(routes).toContain("tenantStore.run(line.userId");
    expect(admission).toContain(
      "Native inbound subscription check failed, continuing remaining gates",
    );
    expect(session).toContain("applyInboundAdmission");
    expect(session).toContain("create_followup_task");
    expect(session).toContain("line-suspended");
    const apply = routes.indexOf("applyInboundAdmission(");
    const lease = routes.indexOf("await acquireAccountOperationLease(");
    const accept = routes.indexOf("await acceptCall(");
    expect(apply).toBeGreaterThan(-1);
    expect(lease).toBeGreaterThan(apply);
    expect(accept).toBeGreaterThan(lease);
  });

  it("only counts fresh inbound presence so a lost end-webhook cannot wedge the line", () => {
    const lib = read("src/lib/inbound-concurrency.ts");
    expect(lib).toContain("PRESENCE_STALENESS_MS");
    expect(lib).toContain("gte(schema.signalPresence.startedAt, freshSince)");
    expect(lib).toContain('not like ${"% · Outbound"}');
  });
});
