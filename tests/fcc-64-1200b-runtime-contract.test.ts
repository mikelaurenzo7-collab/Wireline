import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
 */
describe("64.1200(b) runtime wiring", () => {
  const client = read("src/lib/vapi-client.ts");

  it("(b)(3) every dial site states its regulatory call purpose explicitly", () => {
    // placeOutboundCall requires callPurpose, so a new caller cannot compile
    // without deciding whether the telemarketing announcement applies.
    expect(client).toMatch(/callPurpose: OutboundCallPurpose;/);
    expect(client).toContain("const telemarketing = isMarketingCallPurpose(callPurpose)");

    const sites: Array<[string, RegExp]> = [
      ["src/services/campaign-dialer.ts", /callPurpose: "marketing_or_sales"/],
      ["src/lib/cadence-engine.ts", /callPurpose: "marketing_or_sales"/],
      // The callback engine is the one site whose purpose is not fixed. It
      // dials leads it did not schedule (intake quiet-hours deferrals, and
      // follow-ups inferred from a call summary), and only a consumer's own
      // recorded request earns the "callback" class — which drops the (b)(3)
      // announcement. Everything else stays marketing and keeps it.
      ["src/lib/callback-engine.ts", /consumerRequested \? "callback" : "marketing_or_sales"/],
      ["src/routes/intake-routes.ts", /callPurpose: "marketing_or_sales"/],
      // Web/mobile manual dials pass the request's validated purpose through.
      ["src/routes/outbound-routes.ts", /placeOutboundCall\(\{[\s\S]{0,220}callPurpose,/],
      [
        "src/routes/outbound-dial-atomic-routes.ts",
        /placeOutboundCall\(\{[\s\S]{0,220}callPurpose,/,
      ],
      ["src/routes/mobile-routes.ts", /placeOutboundCall\(\{[\s\S]{0,220}callPurpose,/],
    ];
    for (const [file, pattern] of sites) {
      expect(read(file), `${file} must state a call purpose`).toMatch(pattern);
    }
  });

  it("(b)(3) the telemarketing flag reaches the spoken opening disclosure", () => {
    expect(client).toMatch(
      /complianceFirstMessagePrefix\(\s*agentConfig\.complianceMode,[\s\S]{0,200}telemarketing\s*\}/,
    );
  });

  it("(b)(2) the outbound prompt carries the business callback number when a line is mapped", () => {
    expect(client).toContain("findAgentPhoneLine");
    expect(client).toContain("formatCallbackNumberForSpeech");
    // The number appears in both the standing compliance block and the
    // voicemail protocol — voicemail is where (b)(2) bites hardest, because
    // the called party cannot ask.
    expect(client).toMatch(/OUTBOUND COMPLIANCE \(FEDERAL/);
    expect(client).toMatch(/leave the callback number \$\{callbackNumberSpoken\}/);
  });

  it("(b)(3) the opt-out mechanism records the number and the prompt orders immediate honor", () => {
    // The announced mechanism must actually exist: the in-call tool writes the
    // tenant DNC list, and the post-call transcript failsafe backstops it.
    const handler = read("src/routes/vapi/tool-handlers-core.ts");
    expect(handler).toMatch(/fn === "add_to_dnc"[\s\S]{0,900}insert\(schema\.dncList\)/);
    expect(read("src/lib/vapi-handlers.ts")).toContain("persistTranscriptDncSuppression");
    expect(client).toMatch(/add_to_dnc tool immediately/);
  });

  it("keeps a per-recipient record of the verbal SMS opt-in captured on a live call", () => {
    // Carrier requirement (A2P onboarding): "keep records of consent for each
    // recipient." A live-counterpart send is only reachable after the scripted
    // verbal opt-in, so the send writes the consent_granted ledger row; cold
    // sends rely on pre-existing consent and must not fabricate a grant.
    const handler = read("src/routes/vapi/tool-handlers-core.ts");
    expect(handler).toMatch(/outcome\.ok && isLiveCounterpart[\s\S]{0,2200}consent_granted/);
    expect(handler).toContain('consent_kind: "sms_verbal_optin"');
  });

  it("the acceptable-use policy forbids purchased lists and third-party lead generation", () => {
    // Carrier-forbidden use cases (A2P: affiliate marketing / lead resale;
    // consent cannot be bought, sold, or shared across brands). One
    // noncompliant tenant can suspend the platform's primary Twilio account,
    // so the AUP must make removal enforceable.
    const legal = read("src/components/LegalPage.tsx");
    expect(legal).toMatch(/purchased, rented, or third-party lead lists/);
    expect(legal).toMatch(/affiliate-marketing or third-party lead-generation/);
    expect(legal).toMatch(/cannot be bought, sold, or shared across brands/);
  });
});

/*
 * (b)(3) reaches answering machines too. A prerecorded TELEMARKETING message
 * left on voicemail must carry a toll-free number connecting the called party
 * to an automated opt-out mechanism — identity and a callback number satisfy
 * (b)(1) and (b)(2) only. Wireline operates no opt-out line, so there is no
 * compliant marketing voicemail to compose and the only fail-closed answer is
 * to leave none: the provider ends the call on detection, and the model is told
 * the same thing so it cannot narrate one instead. Non-marketing voicemail is
 * unchanged. Building the opt-out line is what re-enables marketing drops.
 */
describe("(b)(3) applies to answering machines", () => {
  const profile = readFileSync(resolve(process.cwd(), "src/lib/voice-agent-profile.ts"), "utf8");
  const client = readFileSync(resolve(process.cwd(), "src/lib/vapi-client.ts"), "utf8");

  it("leaves no prerecorded message on a marketing call", () => {
    expect(profile).toContain("telemarketing = false,");
    expect(profile).toContain('if (telemarketing) return "";');
  });

  it("passes the call's own marketing classification into the builder", () => {
    const call = client.slice(client.indexOf("voicemailMessage: buildOutboundVoicemailMessage("));
    expect(call.slice(0, 300)).toContain("telemarketing,");
  });

  it("tells the model the same rule, so it cannot speak one anyway", () => {
    const protocol = client.slice(client.indexOf("## VOICEMAIL PROTOCOL"));
    expect(protocol.slice(0, 900)).toContain("Do NOT speak a message");
    expect(protocol.slice(0, 900)).toContain("64.1200(b)(3)");
  });
});
