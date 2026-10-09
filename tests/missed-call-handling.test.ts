import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildMissedCallEmail,
  MISSED_CALL_SUMMARIES,
  missedCallKey,
  missedCallVoicemailEnabled,
  voicemailTwiml,
} from "../src/lib/voice/missed-calls";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("missed calls", () => {
  afterEach(() => {
    delete process.env.WIRELINE_MISSED_CALL_VOICEMAIL_ENABLED;
  });

  it("tells the owner who called, why it was missed, and what to do", () => {
    const busy = buildMissedCallEmail({ callerNumber: "+15125550100", reason: "concurrency" });
    expect(busy.subject).toBe("Missed call from +15125550100");
    expect(busy.text).toContain("Missed while your Bot was on another call.");
    expect(busy.text).toContain("Call them back while the lead is warm.");
    expect(busy.text).toContain("/phone?tab=logs");
    const unpaid = buildMissedCallEmail({ callerNumber: null, reason: "coverage" });
    expect(unpaid.subject).toBe("Missed call on your BotBound line");
    expect(unpaid.text).toContain("/settings/billing");
    expect(unpaid.text).not.toContain("Call them back");
    const hostile = buildMissedCallEmail({ callerNumber: "<b>x</b>", reason: "unavailable" });
    expect(hostile.html).not.toContain("<b>x</b>");
  });

  it("names every reason in plain language", () => {
    for (const summary of Object.values(MISSED_CALL_SUMMARIES)) {
      expect(summary).toMatch(/^Missed /);
      expect(summary).not.toMatch(/coverage|concurrency|daily_minutes|grace/);
    }
    expect(missedCallKey("CA123")).toBe("twilio-missed:CA123");
  });

  it("records a caller only when the operator turned voicemail on", () => {
    expect(missedCallVoicemailEnabled()).toBe(false);
    process.env.WIRELINE_MISSED_CALL_VOICEMAIL_ENABLED = "true";
    expect(missedCallVoicemailEnabled()).toBe(true);
    const twiml = voicemailTwiml();
    expect(twiml).toContain('<Record action="/api/twilio-webhook/voicemail-complete"');
    expect(twiml).toContain('maxLength="120"');
    expect(twiml).toContain(
      'transcribe="true" transcribeCallback="/api/twilio-webhook/voicemail-transcription"',
    );
    const fallback = read("src/routes/twilio-webhook-base.ts");
    expect(fallback).toContain("missedCallVoicemailEnabled() ? voicemailTwiml() : twimlHangup()");
  });

  it("logs a declined call before releasing it, and a voicemail joins that entry", () => {
    const sip = read("src/routes/openai-sip-routes.ts");
    const suspended = sip.slice(sip.indexOf('sessionInput.admission?.mode === "suspended"'));
    expect(suspended.indexOf("await recordMissedCall(")).toBeGreaterThan(-1);
    expect(suspended.indexOf("await recordMissedCall(")).toBeLessThan(
      suspended.indexOf("await rejectCall(callId, 603);"),
    );
    const webhook = read("src/routes/twilio-webhook-base.ts");
    const voicemail = webhook.slice(webhook.indexOf('"/api/twilio-webhook/voicemail-complete"'));
    expect(voicemail).toContain("eq(schema.callLogs.vapiCallId, missedCallKey(callSid))");
    expect(voicemail).toContain("eq(schema.callLogs.outcomeTag, MISSED_CALL_OUTCOME)");
    const transcription = webhook.slice(
      webhook.indexOf('"/api/twilio-webhook/voicemail-transcription"'),
    );
    expect(transcription).toContain("missedCallKey(callSid)");
  });
});
