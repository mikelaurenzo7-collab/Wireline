import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  persistXAIOutboundTwiMLReplay,
  resolveXAIOutboundTwiMLReplay,
} from "../src/lib/voice/xai-outbound-twiml-replay";

const CALL_SID = `CA${"a".repeat(32)}`;
const OTHER_CALL_SID = `CA${"b".repeat(32)}`;
const TOKEN = "signed-lead-token.payload";
const routeSource = readFileSync(
  resolve(process.cwd(), "src/routes/xai-outbound-routes.ts"),
  "utf8",
);

function nativeVoice(
  action: "bridge" | "drop" | "voicemail",
  replay: Record<string, unknown>,
): Record<string, unknown> {
  return {
    provider: "twilio_xai_sip",
    twilio_call_sid: CALL_SID,
    amd_action: action,
    twiml_replay: replay,
  };
}

describe("xAI outbound TwiML retry replay", () => {
  it("checks committed replay before rejecting a terminal lead and persists every AMD outcome", () => {
    const resolver = routeSource.slice(
      routeSource.indexOf("async function resolveBridgeContext("),
      routeSource.indexOf('router.post(\n  "/api/twilio-webhook/xai-outbound-bridge"'),
    );
    expect(resolver.indexOf("const replay = resolveXAIOutboundTwiMLReplay(")).toBeGreaterThan(-1);
    expect(resolver.indexOf("const replay = resolveXAIOutboundTwiMLReplay(")).toBeLessThan(
      resolver.indexOf("const recoverableCompletedRace ="),
    );
    expect(resolver.match(/twiml_replay = persistXAIOutboundTwiMLReplay/g)).toHaveLength(3);
    expect(resolver).toMatch(
      /kind: "voicemail", answeredBy, message: voicemailMessage[\s\S]*status: voicemailMessage \? LEAD_STATUS\.VOICEMAIL_LEFT/,
    );
  });

  it("replays the exact voicemail after the lead has already become terminal", () => {
    const message =
      "Hi, this is Aisha with BotBound. Sorry I missed you; call three one two & ask for us.";
    const replay = persistXAIOutboundTwiMLReplay({
      callSid: CALL_SID,
      decision: { kind: "voicemail", answeredBy: "machine_end_beep", message },
    });
    const terminalLead = {
      callId: CALL_SID,
      status: "Voicemail-Left",
      metadata: { native_voice: nativeVoice("voicemail", replay) },
    };

    expect(
      resolveXAIOutboundTwiMLReplay({
        nativeVoice: terminalLead.metadata.native_voice,
        leadCallSid: terminalLead.callId,
        callbackCallSid: CALL_SID,
        token: TOKEN,
      }),
    ).toEqual({ kind: "voicemail", answeredBy: "machine_end_beep", message });
  });

  it("requires the lead, native metadata, replay record, and callback to share one CallSid", () => {
    const replay = persistXAIOutboundTwiMLReplay({
      callSid: CALL_SID,
      decision: { kind: "drop", answeredBy: "fax" },
    });
    const stored = nativeVoice("drop", replay);

    expect(
      resolveXAIOutboundTwiMLReplay({
        nativeVoice: stored,
        leadCallSid: OTHER_CALL_SID,
        callbackCallSid: CALL_SID,
        token: TOKEN,
      }),
    ).toBeNull();
    expect(
      resolveXAIOutboundTwiMLReplay({
        nativeVoice: { ...stored, twilio_call_sid: OTHER_CALL_SID },
        leadCallSid: CALL_SID,
        callbackCallSid: CALL_SID,
        token: TOKEN,
      }),
    ).toBeNull();
    expect(
      resolveXAIOutboundTwiMLReplay({
        nativeVoice: stored,
        leadCallSid: CALL_SID,
        callbackCallSid: OTHER_CALL_SID,
        token: TOKEN,
      }),
    ).toBeNull();
    expect(
      resolveXAIOutboundTwiMLReplay({
        nativeVoice: { ...stored, amd_action: "bridge" },
        leadCallSid: CALL_SID,
        callbackCallSid: CALL_SID,
        token: TOKEN,
      }),
    ).toBeNull();
  });

  it("reconstructs the same SIP bridge without persisting the short-lived token", () => {
    const replay = persistXAIOutboundTwiMLReplay({
      callSid: CALL_SID,
      decision: {
        kind: "bridge",
        answeredBy: "human",
        callerId: "+13125550123",
      },
    });

    expect(JSON.stringify(replay)).not.toContain(TOKEN);
    expect(
      resolveXAIOutboundTwiMLReplay({
        nativeVoice: nativeVoice("bridge", replay),
        leadCallSid: CALL_SID,
        callbackCallSid: CALL_SID,
        token: TOKEN,
      }),
    ).toEqual({
      kind: "bridge",
      answeredBy: "human",
      callerId: "+13125550123",
      sipUri:
        "sip:+13125550123@sip.voice.x.ai;transport=tls?X-Wireline-Token=signed-lead-token.payload",
    });
  });

  it("replays a no-message AMD drop as a successful deterministic decision", () => {
    const replay = persistXAIOutboundTwiMLReplay({
      callSid: CALL_SID,
      decision: { kind: "drop", answeredBy: "machine_start" },
    });

    expect(
      resolveXAIOutboundTwiMLReplay({
        nativeVoice: nativeVoice("drop", replay),
        leadCallSid: CALL_SID,
        callbackCallSid: CALL_SID,
        token: TOKEN,
      }),
    ).toEqual({ kind: "drop", answeredBy: "machine_start" });
  });

  it("rejects malformed or oversized stored replay payloads", () => {
    expect(() =>
      persistXAIOutboundTwiMLReplay({
        callSid: CALL_SID,
        decision: {
          kind: "voicemail",
          answeredBy: "machine_end_beep",
          message: "x".repeat(1_001),
        },
      }),
    ).toThrow(/replay limit/i);

    const replay = persistXAIOutboundTwiMLReplay({
      callSid: CALL_SID,
      decision: { kind: "voicemail", answeredBy: "machine_end_beep", message: "Call us back." },
    });
    expect(
      resolveXAIOutboundTwiMLReplay({
        nativeVoice: nativeVoice("voicemail", { ...replay, voicemail_message: {} }),
        leadCallSid: CALL_SID,
        callbackCallSid: CALL_SID,
        token: TOKEN,
      }),
    ).toBeNull();
  });
});
