import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("production Vapi v2 webhook contracts", () => {
  const webhook = read("src/routes/vapi-v2.ts");

  it("registers the canonical production webhook route", () => {
    expect(read("src/server/register-api-routes.ts")).toContain('from "../routes/vapi-v2"');
    expect(webhook).toContain('router.post("/api/vapi-webhook"');
  });

  it("ports showcase, billing, tools, and presence from legacy v1", () => {
    expect(webhook).toContain("findShowcaseAgentByPayload");
    expect(webhook).toContain("dispatchAgentToolCall");
    expect(webhook).toContain("handleEndOfCallReport");
    expect(webhook).toContain('type: "vapi_webhook"');
    expect(webhook).toContain("signalPresence");
    expect(webhook).toContain("notifyInboundCall");
    expect(webhook).toContain("setVapiAssistantSpeaking");
    expect(webhook).toContain("subscriptionStatus");
  });

  it("does not use the slim v2-only shortcut handlers", () => {
    expect(webhook).not.toContain("dispatchScopedToolCall");
    expect(webhook).not.toContain("onConflictDoNothing");
  });

  it("keeps legacy v1 index unmounted", () => {
    expect(() => read("src/routes/vapi/index.ts")).toThrow();
  });
});
