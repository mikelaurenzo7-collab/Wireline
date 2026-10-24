import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

// Live-call recording is a per-Bot owner choice, default OFF. One flag
// (agents.call_recording_enabled) drives carrier capture on the Twilio
// bridges AND the recording notice in the Bot's spoken opening. The decision
// is snapshotted once per call so a mid-call flag toggle cannot make capture
// and disclosure disagree, and recording completion correlates by the exact
// Twilio parent call SID rather than a lead's latest placement metadata.
describe("live call recording (owner choice) contract", () => {
  it("stores the choice per Bot, default off", () => {
    const schemaBase = read("src/db/schema-base.ts");
    expect(schemaBase).toContain(
      'callRecordingEnabled: boolean("call_recording_enabled").default(false).notNull()',
    );
    const migration = read("drizzle/migrations/0184_agent_call_recording.sql");
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS "call_recording_enabled" boolean DEFAULT false NOT NULL',
    );
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

  it("snapshots one recording decision per call and reads it for both capture and notice", () => {
    // Inbound: the decision is read once when TwiML is built, signed into the
    // inbound token, and used for the <Dial> in the same response. Admission
    // reads the signed claim, never the Bot's current flag.
    const inbound = read("src/routes/openai-inbound-twilio-routes.ts");
    expect(inbound).toContain(
      "const callRecordingEnabled = await inboundCallRecordingEnabled(owner);",
    );
    expect(inbound).toContain("inboundBridgeTwiml(target, callRecordingEnabled)");
    expect(inbound).toContain("callRecordingEnabled,");
    const token = read("src/lib/voice/openai-inbound-token.ts");
    expect(token).toContain('const TOKEN_VERSION = "2"');
    expect(token).toContain("callRecordingEnabled: boolean");
    expect(token).toContain('claims.callRecordingEnabled ? "1" : "0"');
    expect(token).toContain('recordingRaw === "1"');

    const sipRoutes = read("src/routes/openai-sip-routes.ts");
    expect(sipRoutes).toContain(
      "inboundVerification?.ok ? inboundVerification.claims.callRecordingEnabled : false",
    );
    const inboundContext = sipRoutes.slice(
      sipRoutes.indexOf("async function resolveInboundContext"),
      sipRoutes.indexOf("async function resolveOutboundContext"),
    );
    expect(inboundContext).not.toContain("schema.agents.callRecordingEnabled");

    // Outbound: the decision is snapshotted into the placement row when the
    // carrier placement is created; both the bridge TwiML (capture) and SIP
    // admission (notice) read that stored value.
    const placement = read("src/lib/voice/openai-outbound-placement.ts");
    expect(placement).toContain("callRecordingEnabled: await readCallRecordingEnabled(tx, input)");
    expect(placement).toContain(
      "const callRecordingEnabled = await readCallRecordingEnabled(tx, input);",
    );
    expect(placement).toContain("call_recording_enabled: input.callRecordingEnabled");

    const outbound = read("src/routes/openai-outbound-routes.ts");
    expect(outbound).toContain(
      "const callRecordingEnabled = nativeVoice.call_recording_enabled === true;",
    );
    const outboundContext = sipRoutes.slice(
      sipRoutes.indexOf("async function resolveOutboundContext"),
      sipRoutes.indexOf("async function callControl"),
    );
    expect(outboundContext).toContain(
      "const callRecordingEnabled = nativeVoice.call_recording_enabled === true;",
    );
    expect(outboundContext).not.toContain("schema.agents.callRecordingEnabled");
  });

  it("persists a completed carrier recording by the immutable Twilio parent call SID", () => {
    const webhook = read("src/routes/twilio-webhook-base.ts");
    expect(webhook).toContain('"/api/twilio-webhook/live-recording-complete"');
    expect(webhook).toContain('status !== "completed"');
    // Attribution reads the call row's exact parent SID, never lead metadata.
    expect(webhook).toContain("eq(schema.callLogs.twilioParentCallSid, callSid)");
    expect(webhook).toContain("isNull(schema.callLogs.recordingUrl)");
    expect(webhook).not.toContain("->> 'twilio_call_sid'");
    expect(webhook).not.toContain("`outbound:${placementId}`");

    // The call row is stamped with the parent SID when it is created.
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(session).toContain("twilioParentCallSid?: string;");
    expect(session).toContain("input.inboundTwilioCallSid?.trim() || null");
    expect(session).toContain("input.twilioParentCallSid?.trim() || null");
    expect(session).toContain("twilioParentCallSid,");

    // Outbound admission takes the SID from the placement's persisted bridge
    // marker, and the replay helper is the only reader of that marker.
    const replay = read("src/lib/voice/openai-outbound-twiml-replay.ts");
    expect(replay).toContain("resolveOpenAIOutboundParentCallSid");
    const sipRoutes = read("src/routes/openai-sip-routes.ts");
    expect(sipRoutes).toContain("resolveOpenAIOutboundParentCallSid(nativeVoice)");

    // The durable identity is an amended 0184 column with a unique index.
    const schemaBase = read("src/db/schema-base.ts");
    expect(schemaBase).toContain('twilioParentCallSid: text("twilio_parent_call_sid")');
    expect(schemaBase).toContain("uq_call_logs_twilio_parent_call_sid");
    const migration = read("drizzle/migrations/0184_agent_call_recording.sql");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "twilio_parent_call_sid" text');
    expect(migration).toContain("uq_call_logs_twilio_parent_call_sid");
    expect(migration).toContain('"twilio_parent_call_sid" IS NOT NULL');
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
    expect(session).toContain(
      "complianceFirstMessagePrefix(null, null, { recordingEnabled: true })",
    );
    // AI-identity disclosure composition stays flag-independent.
    expect(session).toContain("complianceFirstMessagePrefix(");
    expect(session).toContain("outboundAiCall: true");
  });

  it("erases live-call recordings on account deletion regardless of provider prefix", () => {
    const erasure = read("src/lib/provider-call-erasure.ts");
    // The voicemail prefix still selects voicemail pointers, but live-call
    // pointers are classified by their stored Twilio recording URL.
    expect(erasure).toContain("TWILIO_VOICEMAIL_PREFIX");
    expect(erasure).toContain("twilioRecordingRefFromUrl");
    expect(erasure).toContain("liveRecordingUrls");
    expect(erasure).toContain("twilioRecordingRefFromUrl(recordingUrl)?.accountSid === accountSid");
    // The sweep is still wired before the local hard-delete and still defers
    // the purge when the provider fails.
    const deletion = read("src/lib/account-deletion.ts");
    const sweep = deletion.indexOf("await eraseProviderCallArtifacts(callArtifactPointers)");
    expect(sweep).toBeGreaterThan(-1);
    expect(deletion.indexOf("async function purgeAccountOutsideTenantContext")).toBeGreaterThan(
      sweep,
    );
  });
});
