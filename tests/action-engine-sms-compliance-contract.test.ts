import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const engine = read("src/lib/action-engine.ts");

describe("action-engine outbound SMS compliance gate", () => {
  it("routes auto send_text_message through evaluateOutboundDialGate before Twilio send", () => {
    expect(engine).toContain('import { evaluateOutboundDialGate } from "./outbound-dial-gate"');
    expect(engine).toContain("NON_MARKETING_SMS_ROLES");

    const handlerMatch = engine.match(
      /async function handleSendTextMessage\([\s\S]*?\n\}/,
    );
    expect(handlerMatch).not.toBeNull();
    const handler = handlerMatch![0];

    expect(handler).toContain("await evaluateOutboundDialGate({");
    expect(handler).toContain("isMarketingCall");
    expect(handler).toContain("userId");
    expect(handler).toContain("phone");
    expect(handler).toContain("leadId: lead?.id");
    expect(handler).toContain("lastCalledAt: lead?.lastCalledAt");
    expect(handler).toContain("metadata:");
    // Gate must run before the Twilio send, not after.
    expect(handler.indexOf("evaluateOutboundDialGate")).toBeLessThan(
      handler.indexOf("sendTenantMessage"),
    );
    expect(handler).toContain("failing closed");
    expect(handler).toContain("success: false");
  });

  it("treats non-service agent roles as marketing SMS (fail-closed)", () => {
    expect(engine).toContain("NON_MARKETING_SMS_ROLES");
    expect(engine).toContain("cleanOutboundSmsPhone");
    expect(engine).toContain("let isMarketingCall = true");
    expect(engine).toContain("!NON_MARKETING_SMS_ROLES.has(role)");
  });
});
