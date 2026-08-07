import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Source with comments removed. Negative assertions ("this shape must not
 * appear") belong here: a comment describing the defect being fixed contains
 * the same literal as the defect, and would otherwise fail the gate that
 * documents it.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("Twilio voice failover contract", () => {
  const routes = read("src/routes/twilio-webhook-base.ts");
  const codeOnly = stripComments(routes);
  const auth = read("src/lib/twilio-webhook-auth.ts");

  it("fails production callbacks closed through Twilio's official signature verifier", () => {
    expect(auth).toContain("Twilio.validateRequest");
    expect(auth).toMatch(
      /if \(!authToken\) \{[\s\S]*isProductionRuntime\(\) \? \{ ok: false \} : \{ ok: true \}/,
    );
    expect(auth).toContain("TWILIO_ACCOUNT_SID");
  });

  it("does not IP-throttle signed provider retries ahead of verification", () => {
    expect(routes).not.toContain("twilioVoiceRateLimiter");
    expect(routes).not.toContain('bucket: "webhook:twilio:voice"');
    expect(routes).toMatch(
      /"\/api\/twilio-webhook\/voice-fallback",[\s\S]*res\.setHeader\("Content-Type", "text\/xml"\);[\s\S]*verifyTwilioSignature\(req\)/,
    );
  });

  it("falls through an unanswered human transfer to voicemail", () => {
    expect(routes).toContain('action="/api/twilio-webhook/voice-fallback-complete"');
    expect(routes).toContain(
      'if (dialStatus === "completed") return res.status(200).send(twimlHangup());',
    );
    expect(routes).toContain('action="/api/twilio-webhook/voicemail-complete"');
    expect(routes).toContain('method="POST"');
  });

  it("never records or transcribes a HIPAA line on the failover path", () => {
    // The failover answers the same tenant line as the full assistant, so it
    // inherits the same obligations. It emitted <Record transcribe="true">
    // unconditionally, so a HIPAA agent's caller was recorded and machine-
    // transcribed — and the audio URL plus transcript were persisted to
    // wireline_call_logs — while HIPAA mode's entire behavioural effect
    // everywhere else in the product is recording suppression.
    const builder = routes.slice(
      routes.indexOf("function failoverVoicemailTwiml("),
      routes.indexOf("async function resolveFailoverCompliance("),
    );
    expect(builder).toContain('const recordingEnabled = compliance.complianceMode !== "hipaa";');
    // The suppressed branch must return BEFORE any <Record> is emitted.
    //
    // Anchor both slice bounds first. Without this, deleting the early return
    // makes the start indexOf return -1, String.slice coerces that to length-1,
    // and `suppressed` becomes "" — so both not.toContain assertions below pass
    // VACUOUSLY against an empty string. The mutation died only because of the
    // trailing positive assertion, which made the kill incidental rather than
    // intentional and one "redundant line" cleanup away from toothless.
    const guardStart = builder.indexOf("if (!recordingEnabled) {");
    const guardEnd = builder.indexOf("const disclosure =");
    expect(guardStart, "HIPAA suppression branch must exist").toBeGreaterThan(-1);
    expect(guardEnd, "disclosure branch must follow it").toBeGreaterThan(guardStart);

    const suppressed = builder.slice(guardStart, guardEnd);
    expect(suppressed.length).toBeGreaterThan(0);
    expect(suppressed).not.toContain("<Record");
    expect(suppressed).not.toContain("transcribe");
    expect(suppressed).toContain("return (");
  });

  it("speaks the recording disclosure on every call it does record", () => {
    const builder = routes.slice(
      routes.indexOf("function failoverVoicemailTwiml("),
      routes.indexOf("async function resolveFailoverCompliance("),
    );
    // Same helper the assistant paths use, so the wording cannot drift apart.
    expect(builder).toContain("complianceFirstMessagePrefix(");
    expect(builder).toContain("recordingEnabled: true");
    // Spoken before the prompt, and escaped like every other dynamic TwiML value.
    expect(builder).toContain("escapeTwimlValue(");
    expect(builder).toMatch(/\$\{disclosure\}Please leave your name/);
  });

  it("resolves compliance for both failover entry points", () => {
    // The transfer-complete callback previously called the builder with no
    // tenant context at all, so an unrecorded-by-policy line would still have
    // been recorded there even once the primary path was fixed.
    // Both entry points, named explicitly: the primary voice-fallback (which
    // speaks the outage context) and the unanswered-transfer fallthrough.
    expect(routes).toContain("failoverVoicemailTwiml(true, await resolveFailoverCompliance(to))");
    expect(routes).toContain("failoverVoicemailTwiml(false, await resolveFailoverCompliance(to))");
    // No call site may omit the posture. Run this against CODE only: a comment
    // explaining the old `failoverVoicemailTwiml()` shape would otherwise fail
    // the very gate that documents it.
    expect(codeOnly).not.toMatch(/failoverVoicemailTwiml\(\)/);
    expect(codeOnly).not.toMatch(/failoverVoicemailTwiml\((?:true|false)\)/);
    // Resolution walks the same chain inbound routing uses, and degrades rather
    // than throwing — this runs when things are already broken.
    const resolver = routes.slice(
      routes.indexOf("async function resolveFailoverCompliance("),
      routes.indexOf("function publicAssetUrl("),
    );
    expect(resolver).toContain("schema.agents.complianceMode");
    expect(resolver).toContain("eq(schema.phoneNumbers.phoneNumber, to)");
    expect(resolver).toContain("catch (error)");
    expect(resolver).toContain("return unknown;");
  });

  it("validates transfer destinations and escapes dynamic TwiML values", () => {
    expect(routes).toContain("function validE164");
    expect(routes).toMatch(/\^\\\+\[1-9\]\\d\{7,14\}\$/);
    expect(routes).toContain("escapeTwimlValue(fallbackNumber)");
    expect(routes).toContain("escapeTwimlValue(sipUri)");
  });

  it("persists voicemail idempotently before acknowledging the callback", () => {
    expect(routes).toContain('createHash("sha256")');
    expect(routes).toContain("twilio-voicemail:");
    expect(routes).toContain(".onConflictDoNothing({ target: schema.callLogs.vapiCallId })");
    expect(routes).toMatch(
      /const persisted = await tenantStore\.run[\s\S]*if \(!persisted\) return res\.status\(200\)[\s\S]*Voicemail persisted during Vapi failover[\s\S]*return res\.status\(200\)/,
    );
    expect(routes).toContain("return res.status(503).send(twimlHangup())");
    expect(routes).toContain('state: "timed_out"');
    expect(routes).toContain("3_000");
    expect(routes).toContain('log.warn("Voicemail owner notify was not accepted"');
  });

  it("captures the voicemail transcript via a dedicated transcribeCallback", () => {
    // Twilio delivers <Record transcribe> results to transcribeCallback, never
    // on the recording action callback, so a missing callback silently drops
    // every failover transcript. The Record element must name the callback and
    // a matching route must persist it onto the same voicemail row.
    expect(routes).toContain('transcribeCallback="/api/twilio-webhook/voicemail-transcription"');
    expect(routes).toContain('"/api/twilio-webhook/voicemail-transcription"');
    expect(routes).toMatch(
      /TranscriptionStatus[\s\S]*status !== "completed"[\s\S]*update\(schema\.callLogs\)[\s\S]*set\(\{ transcript: transcription \}\)/,
    );
  });

  it("ships the failover chime as a non-empty static asset", () => {
    const asset = resolve(process.cwd(), "public/sounds/wireline-transfer-chime.wav");
    expect(existsSync(asset)).toBe(true);
    expect(statSync(asset).size).toBeGreaterThan(1_000);
  });
});
