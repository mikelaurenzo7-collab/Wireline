import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { detectOptOut } from "../src/lib/tcpa-consent";
import { SALES_DNC_LISTED_MESSAGE, INTERNAL_DNC_MESSAGE } from "../src/lib/outbound-compliance-copy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("one workspace do-not-contact list", () => {
  it("recognizes spoken opt-outs", () => {
    expect(detectOptOut("Please stop calling").found).toBe(true);
    expect(detectOptOut("Take me off your list").found).toBe(true);
    expect(detectOptOut("Thanks, talk tomorrow").found).toBe(false);
  });

  it("writes spoken opt-outs and STOP texts onto the same workspace list the gates read", () => {
    const calls = read("src/lib/call-dnc-suppression.ts");
    const sms = read("src/routes/twilio-webhook.ts");
    const gate = read("src/lib/outbound-dial-gate.ts");
    const send = read("src/lib/twilio-service.ts");
    expect(calls).toContain("schema.dncList");
    expect(sms).toContain(".insert(schema.dncList)");
    expect(gate).toContain("isDncBlocked(opts.userId, opts.phone)");
    expect(send).toContain("isDncBlocked");
    expect(INTERNAL_DNC_MESSAGE).toMatch(/won't call or text/);
    expect(SALES_DNC_LISTED_MESSAGE).toContain("Existing customer");
  });
});

describe("outbound purpose surfaces", () => {
  it("shows Returning their call, the permission checkbox, and the sales campaign badge", () => {
    const dialog = read("src/components/OutboundDialDialog.tsx");
    const picker = read("src/components/outbound/OutboundPurposePicker.tsx");
    const sms = read("src/components/SmsThreads.tsx");
    const campaigns = read("src/components/outbound/CampaignsPanel.tsx");
    const opening = read("src/lib/voice/openai-sip-session.ts");
    expect(picker).toContain("Returning their call");
    expect(dialog).toContain("OutboundPurposePicker");
    expect(dialog).toContain("OUTBOUND_CONSENT_LABEL");
    expect(picker).toContain("NONSALES_CONFIRMATION_LABEL");
    expect(read("src/lib/outbound-compliance-copy.ts")).toContain("This isn't selling anything.");
    expect(sms).toContain("OutboundPurposePicker");
    expect(campaigns).toContain("CAMPAIGN_SALES_BADGE");
    expect(opening).toContain('|| "this business"');
    expect(opening).toContain("Do not skip it, replace it");
    expect(read("src/components/LegalPage.tsx")).toContain("LAWYER REVIEW NEEDED");
    expect(read("src/components/LegalPage.tsx")).toContain("Telephone Consumer Protection Act");
    expect(read("src/components/LegalPage.tsx")).toContain("Telemarketing Sales Rule");
  });
});
