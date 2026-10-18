import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Twilio voice failover contract", () => {
  const routes = read("src/routes/twilio-webhook-base.ts");
  const inboundRoutes = read("src/routes/openai-inbound-twilio-routes.ts");
  const outboundRoutes = read("src/routes/openai-outbound-routes.ts");
  const outboundService = read("src/lib/voice/outbound-call-service.ts");
  const sipConfig = read("src/lib/voice/openai-sip-config.ts");
  const promptGenerator = read("scripts/generate-openai-static-prompts.mjs");
  const auth = read("src/lib/twilio-webhook-auth.ts");

  it("fails production callbacks closed through Twilio's official signature verifier", () => {
    expect(auth).toContain("Twilio.validateRequest");
    expect(auth).toMatch(
      /if \(!authToken\) \{[\s\S]*TWILIO_WEBHOOK_DISABLE_AUTH[\s\S]*return \{ ok: false \}/,
    );
    expect(auth).toContain("TWILIO_ACCOUNT_SID");
  });

  it("does not IP-throttle signed provider retries ahead of verification", () => {
    expect(routes).not.toContain("twilioVoiceRateLimiter");
    expect(routes).not.toContain('bucket: "webhook:twilio:voice"');
    const shared = routes.slice(
      routes.indexOf("export async function handleTwilioVoiceFallback"),
      routes.indexOf('router.post("/api/twilio-webhook/voice-fallback"'),
    );
    expect(shared).toContain('res.setHeader("Content-Type", "text/xml")');
    expect(shared).toContain("verifyTwilioSignature(req)");
    expect(routes).toContain(
      'router.post("/api/twilio-webhook/voice-fallback", handleTwilioVoiceFallback)',
    );
    expect(inboundRoutes).toContain(
      'router.post("/api/twilio-webhook/openai-inbound-fallback", handleTwilioVoiceFallback)',
    );
  });

  it("gives outbound voice callbacks bounded connect, read, 5xx, and total retries", () => {
    expect(sipConfig).toContain('"#ct=2000&rt=5000&tt=15000&rc=2&rp=ct,rt,5xx"');
    expect(sipConfig).toMatch(
      /twilioOpenAIOutboundBridgeUrl[\s\S]*searchParams\.set\("token", token\)[\s\S]*withTwilioConnectionOverrides/,
    );
    expect(sipConfig).toMatch(
      /twilioOpenAIOutboundStatusUrl[\s\S]*searchParams\.set\("token", token\)[\s\S]*withTwilioConnectionOverrides/,
    );
  });

  it("falls back to a static signed BotBound response when outbound TwiML stays unavailable", () => {
    expect(outboundService).toContain("fallbackUrl: twilioOpenAIOutboundFallbackUrl(token)");
    expect(outboundService).toContain('fallbackMethod: "POST"');
    expect(sipConfig).toContain("/api/twilio-webhook/openai-outbound-fallback");
    const fallback = outboundRoutes.slice(
      outboundRoutes.indexOf('"/api/twilio-webhook/openai-outbound-fallback"'),
      outboundRoutes.indexOf('"/api/twilio-webhook/openai-outbound-status"'),
    );
    expect(fallback).toContain("evaluateTwilioWebhookAuth(req)");
    expect(fallback).toContain("verifyOpenAIOutboundToken");
    expect(fallback).toContain("send(emptyTwiml())");
    expect(fallback).not.toContain("voicemailTwiml(");
    expect(fallback).not.toContain("<Say>");
    expect(fallback).not.toContain("<Dial");
  });

  it("hangs up after an unanswered human transfer without recording", () => {
    expect(routes).toContain('action="/api/twilio-webhook/voice-fallback-complete"');
    const completion = routes.slice(
      routes.indexOf('router.post("/api/twilio-webhook/voice-fallback-complete"'),
      routes.indexOf('router.post("/api/twilio-webhook/voicemail-complete"'),
    );
    expect(completion).toContain("return res.status(200).send(twimlHangup())");
    expect(completion).not.toContain("<Record");
    expect(completion).not.toContain("failoverVoicemailTwiml");
    expect(routes).toContain('method="POST"');
  });

  it("transitions a failed OpenAI SIP Dial into signed continuity", () => {
    expect(inboundRoutes).toContain(
      'action="/api/twilio-webhook/openai-inbound-dial-complete" method="POST"',
    );
    const complete = inboundRoutes.slice(
      inboundRoutes.indexOf('"/api/twilio-webhook/openai-inbound-dial-complete"'),
      inboundRoutes.indexOf('"/api/twilio-webhook/openai-inbound-fallback"'),
    );
    const auth = complete.indexOf("evaluateTwilioWebhookAuth(req)");
    const status = complete.indexOf("DialCallStatus");
    const continuity = complete.indexOf("await handleTwilioVoiceFallback(req, res)");
    expect(auth).toBeGreaterThan(-1);
    expect(status).toBeGreaterThan(auth);
    expect(continuity).toBeGreaterThan(status);
    expect(complete).toContain('dialStatus === "completed"');
    expect(complete).toContain("INBOUND_DIAL_CONTINUITY_STATUSES.has(dialStatus)");
  });

  it("lets carrier fallback run on transient primary failures only", () => {
    expect(inboundRoutes).toMatch(
      /if \(!calledNumber\) \{[\s\S]*?res\.status\(200\)\.send\(hangupTwiml\(\)\)/,
    );
    expect(inboundRoutes).toMatch(
      /if \(!phoneVoiceRuntimeConfigured\(\)\) \{[\s\S]*?res\.status\(503\)\.send\(hangupTwiml\(\)\)/,
    );
    expect(inboundRoutes).toMatch(
      /if \(!userId\) \{[\s\S]*?res\.status\(200\)\.send\(hangupTwiml\(\)\)/,
    );
    expect(inboundRoutes).toMatch(
      /if \(!environment\.allowed\) \{[\s\S]*?res\.status\(200\)\.send\(hangupTwiml\(\)\)/,
    );
    expect(inboundRoutes).toMatch(
      /catch \(error\) \{[\s\S]*?res\.status\(503\)\.send\(hangupTwiml\(\)\)/,
    );
  });

  it("serves only a non-speech chime and validated human transfer on continuity", () => {
    const shared = routes.slice(
      routes.indexOf("export async function handleTwilioVoiceFallback"),
      routes.indexOf('router.post("/api/twilio-webhook/voice-fallback"'),
    );
    expect(shared).toContain("/sounds/wireline-transfer-chime.wav");
    expect(shared).toContain("escapeTwimlValue(receipt.fallbackNumber)");
    expect(shared).toContain("prepareTwilioVoiceFallback");
    expect(shared).toContain('timeLimit="${remainingSeconds}"');
    expect(shared).toContain(
      "Math.min(receipt.maxSeconds, Math.floor((receipt.deadlineAtMs - Date.now()) / 1000))",
    );
    expect(shared).toContain(
      "if (remainingSeconds <= 0) return res.status(200).send(twimlHangup())",
    );
    expect(shared).toContain('statusCallbackEvent="completed"');
    expect(shared).toContain("return res.status(200).send(twimlHangup())");
    expect(shared).not.toMatch(/<Record\b|transcribeCallback|openai-[a-z-]+\.mp3/);
  });

  it("validates transfer destinations and escapes dynamic TwiML values", () => {
    expect(routes).toContain("function validE164");
    expect(routes).toMatch(/\^\\\+\[1-9\]\\d\{7,14\}\$/);
    expect(routes).toContain("escapeTwimlValue(receipt.fallbackNumber)");
    // The SIP noun (URI and any digest credentials) is escaped in one place.
    expect(inboundRoutes).toContain("renderSipNoun(target)");
    expect(read("src/lib/voice/realtime-sip-target.ts")).toContain(
      "return `<Sip${auth}>${escapeXml(target.uri)}</Sip>`",
    );
  });

  it("persists voicemail idempotently before acknowledging the callback", () => {
    expect(routes).toContain('createHash("sha256")');
    expect(routes).toContain("twilio-voicemail:");
    expect(routes).toContain(".onConflictDoNothing({ target: schema.callLogs.vapiCallId })");
    expect(routes).toMatch(
      /const persisted = await tenantStore\.run[\s\S]*Duplicate Twilio voicemail callback reusing persisted call[\s\S]*Voicemail persisted during voice failover[\s\S]*return res\.status\(200\)/,
    );
    expect(routes).toContain("return res.status(503).send(twimlHangup())");
    expect(routes).toContain("idempotencyKey: `voicemail-failover/${recordingKey}`");
    expect(routes).toContain('notification.disposition !== "suppressed"');
    expect(routes).toContain("Voicemail owner notification was not accepted");
    expect(routes).not.toContain("Promise.race([");
  });

  it("keeps in-flight legacy voicemail callbacks signed without advertising new recording", () => {
    expect(routes).not.toContain(
      'transcribeCallback="/api/twilio-webhook/voicemail-transcription"',
    );
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

  it("ships zero carrier synthesis and no references to absent prompt assets", () => {
    for (const route of [routes, inboundRoutes, outboundRoutes]) {
      expect(route).not.toMatch(/Polly\.|<Say\b|\.say\s*\(/i);
      expect(route).not.toMatch(/openai-[a-z-]+\.mp3/i);
      expect(route).not.toContain("openai-static-prompts");
    }
    expect(outboundRoutes).not.toContain("voicemailTwiml");
    expect(promptGenerator.match(/file: "openai-[a-z-]+\.mp3"/g)).toHaveLength(6);
    expect(promptGenerator).toContain("future reproducibility");
  });
});
