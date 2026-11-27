import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { composeOutboundOpening, OUTBOUND_OPT_OUT_NOTICE } from "../src/lib/voice/outbound-opening";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * 47 CFR 64.1200(b) duties for outbound AI calls, wired end to end. FCC 24-17
 * confirmed AI voices are "artificial or prerecorded voice" under the TCPA, so
 * every outbound AI call owes (b)(1) identity at the start of the message,
 * (b)(2) a callback number for the responsible business, and — for
 * telemarketing — (b)(3) an announced, automated, voice-activated opt-out
 * mechanism that records the number on the seller's do-not-call list. Each
 * assertion here pins one link in that chain; a broken link is a per-call
 * statutory-damages exposure, not a style regression.
 *
 * Production PSTN is native Twilio + OpenAI Realtime SIP. The shared placement
 * boundary and SIP session are the homes of these duties.
 */
describe("64.1200(b) runtime wiring", () => {
  const placement = read("src/lib/voice/outbound-call-service.ts");
  const session = read("src/lib/voice/openai-sip-session.ts");

  it("(b)(3) every dial site states its regulatory call purpose explicitly", () => {
    // placeOutboundCall requires callPurpose, so a new caller cannot compile
    // without deciding whether the telemarketing announcement applies.
    expect(placement).toMatch(/callPurpose: OutboundCallPurpose;/);
    expect(placement).toContain("const telemarketing = isMarketingCallPurpose(input.callPurpose)");

    const sites: Array<[string, RegExp]> = [
      ["src/services/campaign-dialer.ts", /callPurpose: "marketing_or_sales"/],
      ["src/lib/cadence-engine.ts", /callPurpose: "marketing_or_sales"/],
      // The callback engine is the one site whose purpose is not fixed. It
      // dials leads it did not schedule (intake quiet-hours deferrals, and
      // follow-ups inferred from a call summary), and only a consumer's own
      // recorded request earns the "callback" class — which drops the (b)(3)
      // announcement. Everything else stays marketing and keeps it.
      ["src/lib/callback-engine.ts", /consumerRequested \? "callback" : "marketing_or_sales"/],
      ["src/lib/intake-auto-dial.ts", /callPurpose: "returning_contact"/],
      // Web/mobile manual dials classify the client label as untrusted and pass
      // only the server-derived effective purpose to the placement boundary.
      [
        "src/routes/outbound-routes.ts",
        /placeOutboundCall\(\{[\s\S]{0,700}callPurpose: effectiveCallPurpose/,
      ],
      [
        "src/routes/outbound-dial-atomic-routes.ts",
        /placeOutboundCall\(\{[\s\S]{0,700}callPurpose: effectiveCallPurpose/,
      ],
    ];
    for (const [file, pattern] of sites) {
      expect(read(file), `${file} must state a call purpose`).toMatch(pattern);
    }
    const mobile = read("src/routes/mobile-routes.ts");
    expect(mobile).toContain("res.status(503).json(NATIVE_OUTBOUND_UNAVAILABLE)");
    expect(mobile).not.toContain("placeOutboundCall");
  });

  it("(b)(3) the telemarketing flag reaches the spoken opening disclosure", () => {
    const opening = session.slice(session.indexOf("function buildOutboundOpening"));
    expect(opening).toMatch(
      /composeOutboundOpening\(\{[\s\S]{0,500}telemarketing: isMarketingCallPurpose\(purpose\)/,
    );
    // The opt-out notice follows the identification directly, ahead of everything else.
    const spoken = composeOutboundOpening({
      agentName: "Sam",
      businessName: "Ridge Dental",
      callbackNumberSpoken: "three one two, five five five, zero one zero one",
      recordingEnabled: true,
      telemarketing: true,
    });
    expect(spoken).toContain(
      `Hi, this is Sam, an AI assistant with Ridge Dental. ${OUTBOUND_OPT_OUT_NOTICE}`,
    );
  });

  it("(b)(2) the outbound prompt carries the business callback number when a line is mapped", () => {
    expect(session).toContain("formatCallbackNumberForSpeech");
    expect(session).toContain("input.calledNumber");
    // The callback rule names the number and the voicemail protocol tells the
    // Bot to leave it: voicemail is where (b)(2) bites hardest, because the
    // called party cannot ask.
    expect(session).toContain("identify yourself and leave the callback number only");
    // When a placed call goes quiet before the number was said, the connection
    // says it with its check-in instead of leaving it to the model.
    expect(session).toContain("If we got cut off, you can reach us at ${number}.");
    expect(session).toMatch(/OUTBOUND COMPLIANCE \(FEDERAL/);
    expect(session).toMatch(/leave the callback number \$\{callbackNumberSpoken\}/);
    // "During or after the message": a marketing call states the number in its
    // opening, and every other call is told to state it once before it ends.
    expect(session).toContain(
      "It is required: say it once before the call ends, in your goodbye, or as soon as the contact cannot talk right now.",
    );
    const number = "three one two, five five five, zero one zero one";
    const opening = (telemarketing: boolean) =>
      composeOutboundOpening({
        agentName: "Sam",
        businessName: "Ridge Dental",
        callbackNumberSpoken: number,
        recordingEnabled: false,
        telemarketing,
      });
    expect(opening(true)).toContain(`You can reach us at ${number}.`);
    expect(opening(false)).not.toContain(number);
  });

  it("(b)(3) the opt-out mechanism records the number and the prompt orders immediate honor", () => {
    // The announced mechanism must actually exist: the in-call tool writes the
    // tenant DNC list, and the post-call transcript failsafe backstops it.
    const handler = read("src/lib/bot-tools/core.ts");
    expect(handler).toMatch(/fn === "add_to_dnc"[\s\S]{0,900}insert\(schema\.dncList\)/);
    expect(read("src/lib/voice/openai-sip-session.ts")).toContain(
      "persistTranscriptDncSuppression",
    );
    expect(session).toContain("persistTranscriptDncSuppression");
    expect(session).toMatch(/add_to_dnc tool immediately/);
    expect(session).toContain('optOut.kind === "dnc"');
    expect(session).toContain('endedReason = "caller-dnc"');
  });

  it("keeps a per-recipient record of the verbal SMS opt-in captured on a live call", () => {
    // Carrier requirement (A2P onboarding): "keep records of consent for each
    // recipient." A live-counterpart send is only reachable after the scripted
    // verbal opt-in, so the send writes the consent_granted ledger row; cold
    // sends rely on pre-existing consent and must not fabricate a grant.
    const handler = read("src/lib/bot-tools/core.ts");
    expect(handler).toMatch(/outcome\.ok && isLiveCounterpart[\s\S]{0,2200}consent_granted/);
    expect(handler).toContain('consent_kind: "sms_verbal_optin"');
  });

  it("the acceptable-use policy forbids purchased lists and third-party lead generation", () => {
    // Carrier-forbidden use cases (A2P: affiliate marketing / lead resale;
    // consent cannot be bought, sold, or shared across brands). One
    // noncompliant tenant can suspend the platform's primary Twilio account,
    // so the AUP must make removal enforceable.
    const legal = read("src/components/LegalPage.tsx");
    expect(legal).toMatch(/purchased, rented, or third party lead lists/);
    expect(legal).toMatch(/affiliate marketing or third party lead generation/);
    expect(legal).toMatch(/cannot be bought, sold, or shared across brands/);
  });
});

/*
 * (b)(3) reaches answering machines too. A prerecorded TELEMARKETING message
 * left on voicemail must carry a toll-free number connecting the called party
 * to an automated opt-out mechanism — identity and a callback number satisfy
 * (b)(1) and (b)(2) only. Wireline operates no opt-out line, so there is no
 * compliant marketing voicemail to compose and the only fail-closed answer is
 * to leave none: Twilio AMD ends the call on detection, and the model is told
 * the same thing so it cannot narrate one instead. Until approved OpenAI audio
 * is committed, non-marketing machine answers also drop without a message.
 */
describe("(b)(3) applies to answering machines", () => {
  const placement = read("src/lib/voice/outbound-call-service.ts");
  const bridge = read("src/routes/openai-outbound-routes.ts");
  const session = read("src/lib/voice/openai-sip-session.ts");
  const amd = read("src/lib/voice/native-outbound-amd.ts");

  it("leaves no prerecorded message on a marketing call", () => {
    expect(amd).toContain('return telemarketing ? "drop" : "voicemail"');
    const dropBranch = bridge.indexOf('if (amdAction === "drop" || amdAction === "voicemail")');
    expect(dropBranch).toBeGreaterThan(-1);
    expect(bridge).not.toContain("voicemailTwiml");
    expect(bridge).not.toContain("LEAD_STATUS.VOICEMAIL_LEFT");
  });

  it("classifies the call before recording the truthful no-message outcome", () => {
    expect(placement).toContain("machineDetection");
    // Marketing still classifies before any TwiML: its branch returns no
    // asynchronous parameters, so the Bot cannot greet a mailbox.
    const marketingBranch = amd.slice(
      amd.indexOf("if (isMarketingCallPurpose(callPurpose)) {"),
      amd.indexOf('asyncAmd: "true"'),
    );
    expect(marketingBranch).toContain(
      'return { machineDetection: "Enable", machineDetectionTimeout: MARKETING_AMD_TIMEOUT_SECONDS };',
    );
    expect(amd).toContain('return telemarketing ? "drop" : "bridge"');
    expect(bridge).toContain("nativeCallPurposeFromMetadata(nativeVoice.call_purpose)");
    expect(bridge).toContain("resolveNativeAmdBridgeAction({ answeredBy, callPurpose })");
    expect(bridge).toContain("? ANSWERING_MACHINE_NO_VOICEMAIL_SUMMARY");
    expect(bridge).not.toContain("openai-outbound-voicemail.mp3");
    expect(bridge).toContain("AnsweredBy");
    expect(bridge).toContain("emptyTwiml()");
    expect(bridge).toContain("resolveRetryableLeadStatus");
    expect(bridge).toContain("IN_FLIGHT_LEAD_STATUSES");
    expect(read("src/lib/outbound-status.ts")).toContain(
      "export function resolveRetryableLeadStatus",
    );
  });

  it("ends a service call on a background machine result without leaving a message", () => {
    expect(placement).toContain("twilioOpenAIOutboundAmdUrl(token)");
    expect(placement).toContain("...amd,");
    const route = bridge.slice(bridge.indexOf('"/api/twilio-webhook/openai-outbound-amd"'));
    expect(route).toContain("evaluateTwilioWebhookAuth(req)");
    expect(route).toContain("verifyOpenAIOutboundToken(token)");
    expect(route).toContain("openAIOutboundPlacementMatches(nativeVoice, verification.claims)");
    expect(route).toContain(
      "isMarketingCallPurpose(nativeCallPurposeFromMetadata(nativeVoice.call_purpose))",
    );
    expect(route).toContain("resolveNativeAsyncAmdAction(answeredBy)");
    expect(route).toContain("endOutboundCarrierCall(callSid)");
    expect(route).toContain("no voicemail was left");
    expect(route).not.toContain("<Say");
    expect(route).not.toContain("<Play");
    expect(route).not.toContain("LEAD_STATUS.VOICEMAIL_LEFT");
    // `Enable` reports a machine at the start of its greeting, before the beep.
    expect(amd).not.toContain('machineDetection: "DetectMessageEnd"');
    expect(session).toContain('nativeVoice.amd_async_action === "hangup"');
  });

  it("keeps a background machine result when the worker or carrier reports later", () => {
    // A late worker cannot start a conversation on a call the result ended.
    const attach = session.slice(session.indexOf("This outbound call is no longer attachable."));
    expect(attach.slice(0, 400)).toContain('nativeVoice.amd_async_action === "hangup"');
    expect(attach.slice(0, 400)).toContain("reached a machine and was ended");
    // The worker's end-of-call settlement leaves the recorded outcome alone.
    expect(session).toContain("const settleOutcome = currentlyActive && !machineEnded;");
    // The carrier's final status does not turn the outcome into Error.
    expect(read("src/lib/voice/outbound-placement-funding.ts")).toContain(
      'voice.amd_action === "drop" || voice.amd_async_action === "hangup"',
    );
  });

  it("tells the model the same rule, so it cannot speak one anyway", () => {
    const protocol = session.slice(session.indexOf("## VOICEMAIL PROTOCOL"));
    expect(protocol.slice(0, 900)).toContain("Do NOT speak a message");
    expect(protocol.slice(0, 900)).toContain("64.1200(b)(3)");
  });
});
