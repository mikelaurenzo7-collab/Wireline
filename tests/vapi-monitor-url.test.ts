import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowedVapiControlUrl, isAllowedVapiListenUrl } from "../src/lib/vapi-monitor-url";

describe("Vapi monitor capability URL policy", () => {
  it("accepts only TLS Vapi hosts", () => {
    expect(
      isAllowedVapiControlUrl(
        "https://aws-us-west-2-production1-phone-call-websocket.vapi.ai/call/control",
      ),
    ).toBe(true);
    expect(isAllowedVapiListenUrl("wss://stream.vapi.ai/call/transport")).toBe(true);

    expect(isAllowedVapiControlUrl("http://stream.vapi.ai/call/control")).toBe(false);
    expect(isAllowedVapiListenUrl("ws://stream.vapi.ai/call/transport")).toBe(false);
    expect(isAllowedVapiControlUrl("https://vapi.ai.evil.example/control")).toBe(false);
  });

  it("forbids redirects on capability-bearing control requests", () => {
    const sentinel = readFileSync("src/services/sentinel.ts", "utf8");
    expect(sentinel.match(/redirect: "error"/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
