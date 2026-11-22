import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const engine = read("src/lib/action-engine.ts");

describe("action-engine outbound SMS compliance gate", () => {
  it("routes auto send_text_message through evaluateOutboundDialGate before Twilio send", () => {
    expect(engine).toContain('import { evaluateOutboundDialGate } from "./outbound-dial-gate"');
    expect(engine).toContain('import { screenManualOutbound } from "./outbound-manual-screening"');
    expect(engine).toContain("sanitizeUntrustedOutboundMetadata");

    const handlerMatch = engine.match(/async function handleSendTextMessage\([\s\S]*?\n\}/);
    expect(handlerMatch).not.toBeNull();
    const handler = handlerMatch![0];

    expect(handler).toContain("await screenApprovedText({");
    expect(handler).toContain("leadId: lead?.id");
    expect(handler).toContain("lastCalledAt: lead?.lastCalledAt");
    expect(handler.indexOf("screenApprovedText")).toBeLessThan(handler.indexOf("sendTenantMessage"));
    expect(handler).toContain("failing closed");
    expect(handler).toContain("success: false");

    const screeningStart = engine.indexOf("export async function screenApprovedText");
    const screeningEnd = engine.indexOf("async function handleSendTextMessage");
    expect(screeningStart).toBeGreaterThan(-1);
    expect(screeningEnd).toBeGreaterThan(screeningStart);
    const gate = engine.slice(screeningStart, screeningEnd);
    expect(gate).toContain("await screenManualOutbound({");
    expect(gate).toContain('requestedPurpose');
    expect(gate).toContain('"sales"');
    expect(gate).toContain("await evaluateOutboundDialGate({");
    expect(gate.indexOf("screenManualOutbound")).toBeLessThan(gate.indexOf("evaluateOutboundDialGate"));
    expect(gate).toContain('salesScreening: "one_off"');
    expect(gate).toContain("isLiveSessionFollowUp: input.requestedOnThisCall");
    expect(gate).toContain("hasExpressWrittenConsent: false");
    expect(gate).toContain("gate.customerMessage");
    expect(gate).not.toContain("callPurpose");
  });

  it("does not let a tenant-configurable agent role mint a non-marketing exemption", () => {
    expect(engine).not.toContain("NON_MARKETING_SMS_ROLES");
    expect(engine).not.toContain("schema.agents.role");
    expect(engine).toContain("cleanOutboundSmsPhone");
    expect(engine).toContain('? "appointment_service" : "sales"');
    expect(engine).not.toContain("classifyUntrustedDirectDial");
  });
});
