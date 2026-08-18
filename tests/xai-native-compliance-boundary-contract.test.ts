import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("native xAI compliance boundary", () => {
  it("terminates native calls through xAI before considering rollback Vapi control", () => {
    const sentinel = read("src/services/sentinel.ts");

    expect(sentinel).toContain('import { hangupXAISipCall } from "../lib/voice/xai-sip-session"');
    expect(sentinel).toContain('if (!value.startsWith("xai:")) return null');
    expect(sentinel).toContain("await hangupXAISipCall(xaiCallId)");
    expect(sentinel.indexOf("await hangupXAISipCall(xaiCallId)")).toBeLessThan(
      sentinel.indexOf("process.env.VAPI_PRIVATE_KEY"),
    );
    expect(sentinel).toContain('set({ status: "terminated" })');
  });

  it("keeps DNC termination tenant-scoped", () => {
    const sentinel = read("src/services/sentinel.ts");
    expect(sentinel).toContain("eq(schema.signalPresence.userId, userId)");
    expect(sentinel).toContain("inArray(schema.signalPresence.customerNumber, candidates)");
  });

  it("preserves fail-closed marketing classification after xAI attaches", () => {
    const routes = read("src/routes/xai-voice-routes.ts");
    const start = routes.indexOf("function outboundPurpose");
    const end = routes.indexOf("async function resolveAgentContext", start);
    const classifier = routes.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(classifier).toContain("isOutboundCallPurpose(value)");
    expect(classifier).toContain('return isOutboundCallPurpose(value) ? value : "marketing_or_sales"');
    expect(classifier).not.toContain('"service_or_requested"');

    const attachment = routes.slice(
      routes.indexOf("async function resolveOutboundSession"),
      routes.indexOf('router.post(\n  "/api/webhooks/xai/voice"'),
    );
    expect(attachment).toContain("callPurpose: outboundPurpose(nativeVoice.call_purpose)");
  });
});
