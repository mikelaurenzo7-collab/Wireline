import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

// Live-call recording is a per-Bot owner choice, default OFF. One flag
// (agents.call_recording_enabled) drives carrier capture on the Twilio
// bridges AND the recording notice in the Bot's spoken opening, so the
// two can never disagree. These pins hold both states shut.
describe("live call recording (owner choice) contract", () => {
  it("stores the choice per Bot, default off", () => {
    const schemaBase = read("src/db/schema-base.ts");
    expect(schemaBase).toContain(
      'callRecordingEnabled: boolean("call_recording_enabled").default(false).notNull()',
    );
    const migration = read("drizzle/migrations/0184_agent_call_recording.sql");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "call_recording_enabled" boolean DEFAULT false NOT NULL');
  });

  it("exposes the choice through the Bot business profile, owner-scoped like its neighbours", () => {
    const validators = read("src/lib/form-validators.ts");
    expect(validators).toContain("call_recording_enabled: z.boolean().optional()");

    const routes = read("src/routes/agent-routes-v2.ts");
    expect(routes).toContain("callRecordingEnabled: schema.agents.callRecordingEnabled");
    expect(routes).toContain("call_recording_enabled: record.callRecordingEnabled ?? false");
    expect(routes).toContain("patch.callRecordingEnabled = parsed.call_recording_enabled");
  });

  it("captures at the carrier only when the flag is on", () => {
    const helper = read("src/lib/voice/live-call-recording.ts");
    expect(helper).toContain('if (!recordCall) return "";');
    expect(helper).toContain('record="record-from-answer-dual"');
    expect(helper).toContain('recordingStatusCallbackEvent="completed"');
    expect(helper).toContain('"/api/twilio-webhook/live-recording-complete"');

    const inbound = read("src/routes/openai-inbound-twilio-routes.ts");
    expect(inbound).toContain("liveRecordingDialAttributes(recordCall)");
    expect(inbound).toContain("inboundCallRecordingEnabled(owner)");

    const outbound = read("src/routes/openai-outbound-routes.ts");
    expect(outbound).toContain("callRecordingEnabled: boolean");
    expect(outbound).toContain("recordCall: decision.callRecordingEnabled");
    expect(outbound).toContain("liveRecordingDialAttributes(input.recordCall)");
  });

  it("persists a completed carrier recording onto the call row, keyed both directions", () => {
    const webhook = read("src/routes/twilio-webhook-base.ts");
    expect(webhook).toContain('"/api/twilio-webhook/live-recording-complete"');
    expect(webhook).toContain('status !== "completed"');
    // Inbound rows are keyed by the Twilio parent call; outbound rows by the
    // placement whose stored parent SID the callback carries.
    expect(webhook).toContain("`twilio:${callSid}`");
    expect(webhook).toContain("`outbound:${placementId}`");
    expect(webhook).toContain("-> 'native_voice' ->> 'twilio_call_sid'");
    expect(webhook).toContain("isNull(schema.callLogs.recordingUrl)");
  });

  it("serves live-call recordings through the same tenant gate as voicemail", () => {
    const route = read("src/routes/call-recording-routes.ts");
    expect(route).toContain("eq(schema.callLogs.userId, req.user.id)");
    expect(route).toContain('call.providerCallId?.startsWith("twilio-voicemail:")');
    expect(route).toContain('call.providerCallId?.startsWith("openai:")');
    expect(route).toContain("isLiveRecording");
  });

  it("speaks the recording notice only when the same flag is on", () => {
    const session = read("src/lib/voice/openai-sip-session.ts");
    // Outbound: the compliance composer receives the flag itself.
    expect(session).toContain("recordingEnabled: input.callRecordingEnabled === true");
    // Inbound: with the flag off the greeting is returned untouched; with it
    // on, the composer's recording notice is prepended.
    expect(session).toContain("if (input.callRecordingEnabled !== true) return greeting;");
    expect(session).toContain("complianceFirstMessagePrefix(null, null, { recordingEnabled: true })");
    // AI-identity disclosure composition stays flag-independent.
    expect(session).toContain("complianceFirstMessagePrefix(");
    expect(session).toContain("outboundAiCall: true");

    // Both admission paths carry the owner's choice from the agent row.
    const sipRoutes = read("src/routes/openai-sip-routes.ts");
    expect(sipRoutes).toContain("callRecordingEnabled: line.callRecordingEnabled ?? false");
    expect(sipRoutes).toContain("callRecordingEnabled: agentContext.callRecordingEnabled ?? false");
  });
});
