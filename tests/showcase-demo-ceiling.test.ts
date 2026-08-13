import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

beforeEach(() => {
  vi.resetModules();
  delete process.env.WIRELINE_SHOWCASE_DAILY_CALL_CEILING;
  delete process.env.WIRELINE_SHOWCASE_CALLER_DAILY_CALL_CEILING;
});

async function loadModule(rateLimitImpl: (key: string, opts: unknown) => Promise<unknown>) {
  vi.doMock("../src/lib/rate-limit", () => ({ rateLimit: vi.fn(rateLimitImpl) }));
  vi.doMock("../src/lib/server-context", () => ({ log: { error: vi.fn(), warn: vi.fn() } }));
  const { admitShowcaseDemoCall } = await import("../src/lib/showcase-demo-ceiling");
  const { rateLimit } = await import("../src/lib/rate-limit");
  return { admitShowcaseDemoCall, rateLimit };
}

describe("showcase demo aggregate ceiling", () => {
  it("admits under both ceilings and charges both buckets", async () => {
    const { admitShowcaseDemoCall, rateLimit } = await loadModule(async () => ({
      allowed: true,
      remaining: 10,
      resetMs: 1000,
    }));
    const admission = await admitShowcaseDemoCall("+15550001111");
    expect(admission).toEqual({ admitted: true });
    const buckets = vi
      .mocked(rateLimit)
      .mock.calls.map(([, opts]) => (opts as { bucket: string }).bucket);
    expect(buckets).toEqual(["showcase:demo-daily", "showcase:demo-caller-daily"]);
  });

  it("refuses at the global daily ceiling before any caller bucket spend", async () => {
    const { admitShowcaseDemoCall, rateLimit } = await loadModule(async () => ({
      allowed: false,
      remaining: 0,
      resetMs: 1000,
    }));
    const admission = await admitShowcaseDemoCall("+15550001111");
    expect(admission).toEqual({ admitted: false, reason: "global_daily_ceiling" });
    expect(vi.mocked(rateLimit).mock.calls.length).toBe(1);
  });

  it("refuses a single caller farming the line", async () => {
    const { admitShowcaseDemoCall } = await loadModule(async (_key, opts) => ({
      allowed: (opts as { bucket: string }).bucket === "showcase:demo-daily",
      remaining: 0,
      resetMs: 1000,
    }));
    const admission = await admitShowcaseDemoCall("+15550001111");
    expect(admission).toEqual({ admitted: false, reason: "caller_daily_ceiling" });
  });

  it("skips the caller bucket when no caller number is present", async () => {
    const { admitShowcaseDemoCall, rateLimit } = await loadModule(async () => ({
      allowed: true,
      remaining: 10,
      resetMs: 1000,
    }));
    const admission = await admitShowcaseDemoCall(null);
    expect(admission).toEqual({ admitted: true });
    expect(vi.mocked(rateLimit).mock.calls.length).toBe(1);
  });

  it("fails open on limiter outage — the marketing line stays answerable", async () => {
    const { admitShowcaseDemoCall } = await loadModule(async () => {
      throw new Error("redis down");
    });
    const admission = await admitShowcaseDemoCall("+15550001111");
    expect(admission).toEqual({ admitted: true });
  });
});

describe("showcase demo ceiling wiring contract", () => {
  const vapi = read("src/routes/vapi-v2.ts");
  const assistantRequestBranch = vapi.slice(
    vapi.indexOf('showcaseRoute && message?.type === "assistant-request"'),
    vapi.indexOf('showcaseRoute && message?.type === "tool-calls"'),
  );

  it("admits before any assistant spend and refuses with the bounded assistant", () => {
    expect(assistantRequestBranch).toContain("admitShowcaseDemoCall");
    expect(assistantRequestBranch.indexOf("admitShowcaseDemoCall")).toBeLessThan(
      assistantRequestBranch.indexOf("buildShowcaseAssistantPayload"),
    );
    expect(assistantRequestBranch).toContain("buildShowcaseAtCapacityAssistant");
    // The refusal path keeps recordings off like the full demo path.
    expect(assistantRequestBranch.split("buildVapiTranscriptOnlyArtifactPlan()").length).toBe(3);
  });

  it("keeps the refusal assistant bounded: short, tool-free, webhook-free", () => {
    const showcase = read("src/lib/showcase-assistant.ts");
    const builder = showcase.slice(
      showcase.indexOf("export function buildShowcaseAtCapacityAssistant"),
      showcase.indexOf("maxDurationSeconds: 45") + 40,
    );
    expect(builder).toContain("maxDurationSeconds: 45");
    expect(builder).not.toContain("tools");
    expect(builder).not.toContain("buildVapiServerConfig");
    expect(builder).not.toContain("analysisPlan");
  });

  it("keeps the full demo assistant's per-call COGS cap in place", () => {
    // The aggregate ceiling complements the per-call cap; neither replaces
    // the other.
    expect(read("src/lib/showcase-assistant.ts")).toContain("maxDurationSeconds: 600");
  });
});
