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
});
