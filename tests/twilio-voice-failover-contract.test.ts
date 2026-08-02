import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Twilio voice failover contract", () => {
  const routes = read("src/routes/twilio-webhook-base.ts");
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

  it("falls through an unanswered human transfer to recorded voicemail", () => {
    expect(routes).toContain('action="/api/twilio-webhook/voice-fallback-complete"');
    expect(routes).toMatch(
      /dialStatus === "completed" \? twimlHangup\(\) : failoverVoicemailTwiml\(\)/,
    );
    expect(routes).toContain('action="/api/twilio-webhook/voicemail-complete"');
    expect(routes).toContain('method="POST"');
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
