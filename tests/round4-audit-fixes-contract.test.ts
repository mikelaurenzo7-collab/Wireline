import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeManagedOpenAIVoiceId } from "../src/data/voice-roster";
import { OPENAI_REALTIME_VOICES } from "../src/lib/voice-catalog";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * Contract: round-4 audit fixes (security/backend, runtime/vendor, marketing).
 * Each assertion locks a verified defect closed; see the commit message for
 * the full failure scenarios.
 */
describe("round-4 audit fix contracts", () => {
  it("purge_deleted_account enqueue is deduped so a failing purge cannot flood the queue", () => {
    const jobs = read("src/routes/job-routes.ts");
    const block = jobs.slice(jobs.indexOf("dueDeletions"));
    expect(block.slice(0, 2200)).toContain("purgeDedupSince");
    expect(block.slice(0, 2200)).toContain('inArray(schema.jobs.status, ["pending", "running"])');
    expect(block.slice(0, 2200)).toContain("if (existingPurge) continue;");
  });

  it("OpenAI SIP sessions claim the provider call atomically before live work", () => {
    const session = read("src/lib/voice/openai-sip-session.ts");
    const claim = session.slice(
      session.indexOf("async function claimCall"),
      session.indexOf("async function updatePresence"),
    );
    expect(claim).toContain("pg_advisory_xact_lock");
    expect(claim).toContain("schema.callLogs.openaiSipSourceId");
    expect(claim).toContain('.for("update")');
    expect(claim).toContain(".insert(schema.callLogs)");
    expect(claim).toContain(".returning({ id: schema.callLogs.id })");
    expect(claim).toContain(
      'if (!created) throw new Error("OpenAI SIP claim insert returned no row.")',
    );
    expect(claim).toContain("await claimOutboundLeadInTransaction(tx, input)");
  });

  it("refund list failures throw for a clean Stripe retry instead of double-reversing", () => {
    const billing = read("src/routes/billing-routes.ts");
    expect(billing).not.toContain("catch(() => [] as Stripe.Refund[])");
    expect(billing).toContain("A transient list failure must THROW");
  });

  it("purge defers when Stripe is unconfigured but the account holds Stripe ids", () => {
    const deletion = read("src/lib/account-deletion.ts");
    expect(deletion).toContain("if (!stripeAvailable())");
    expect(deletion).toContain("deferring purge so a live subscription is not orphaned");
  });

  it("engine scan indexes exist in both the migration and the schema", () => {
    const migration = read("drizzle/migrations/0110_engine_scan_indexes.sql");
    const schema = read("src/db/schema.ts");
    for (const source of [migration, schema]) {
      expect(source).toContain("idx_leads_callback_due_global");
      expect(source).toContain("idx_jobs_type_created_at");
    }
  });

  it("finished system-sentinel jobs are retired by the daily janitor", () => {
    const jobs = read("src/routes/job-routes.ts");
    expect(jobs).toMatch(/DELETE FROM wireline_jobs[\s\S]{0,200}status IN \('done', 'dead'\)/);
  });

  it("managed OpenAI inbound and outbound sessions persist transcripts, not recordings", () => {
    const factory = read("src/lib/voice/openai-phone-agent-runtime.ts");
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(factory).toContain("transcription: { model: OPENAI_REALTIME_DEFAULT_TRANSCRIBER }");
    expect(session).toContain("conversation.item.input_audio_transcription.completed");
    expect(session).toContain("response.output_audio_transcript.delta");
    expect(session).toContain("recordingEnabled: false");
    expect(`${factory}\n${session}`).not.toMatch(/recordingUrl|videoRecording|pcap/i);
  });

  it("actual live openings carry outbound AI identity and purpose disclosures", () => {
    const factory = read("src/lib/voice/openai-phone-agent-runtime.ts");
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(session).toContain("complianceFirstMessagePrefix(");
    expect(session).toContain("outboundAiCall: true");
    expect(session).toContain("recordingEnabled: false");
    expect(session).toContain("formatCallbackNumberForSpeech");
    expect(session).toContain("function buildOutboundOpening");
    expect(session).toContain("Say exactly this and nothing else:");
    expect(factory).toContain("businessName: schema.settings.businessName");
    expect(session).toContain("input.businessName || runtime.agentName");
  });

  it("missing transcripts are logged as unverifiable, never as played", () => {
    const evidence = read("src/lib/voice/ai-disclosure-evidence.ts");
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(evidence).toContain("!input.openingPlaybackConfirmed || !actualOpeningTranscript");
    expect(evidence).toContain('event: "ai_disclosure_unverifiable"');
    expect(session).toContain("actualOpeningTranscript");
    expect(session).not.toContain('transcriptLines.push({ role: "Agent", text: opening })');
  });

  it("every curated OpenAI Realtime voice a picker offers is accepted at runtime", () => {
    const roster = read("src/data/voice-roster.ts");
    const picker = read("src/components/voice/SimpleVoicePicker.tsx");
    const check = roster.slice(roster.indexOf("normalizeManagedOpenAIVoiceId"));
    expect(check.slice(0, 500)).toContain("OPENAI_REALTIME_VOICE_IDS");
    expect(check.slice(0, 500)).toContain(".includes(candidate)");
    expect(picker).toContain(
      'import { OPENAI_REALTIME_VOICES, type VoiceOption } from "../../lib/voice-catalog"',
    );
    expect(picker).toContain("return [...OPENAI_REALTIME_VOICES]");
    for (const voice of OPENAI_REALTIME_VOICES) {
      expect(normalizeManagedOpenAIVoiceId(voice.id)).toBe(voice.id);
    }
  });

  it("the UI latency nudge is never reused as the OpenAI SIP call deadline", () => {
    const factory = read("src/lib/voice/openai-phone-agent-runtime.ts");
    const config = read("src/lib/voice/openai-sip-config.ts");
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(factory).not.toContain("latency.silenceTimeoutSeconds");
    expect(config).toContain("OPENAI_SIP_DEFAULT_MAX_SECONDS = 3_600");
    expect(config).toContain("Math.max(30, Math.min(OPENAI_SIP_PROVIDER_MAX_SECONDS");
    expect(session).toContain("resolveOpenAISipSessionMaxSeconds() * 1_000");
  });

  it("retires the unsupported ambient setting from the current product and runtime", () => {
    const planner = read("src/lib/workspace-planner.ts");
    const workspaceRoutes = read("src/routes/agent-workspace-routes.ts");
    expect(planner).not.toMatch(/ambient_noise|ambientNoise|WORKSPACE_AMBIENT_OPTIONS/);
    expect(workspaceRoutes).not.toMatch(
      /ambient noise|WORKSPACE_AMBIENT_OPTIONS|kind === "ambient"/i,
    );
    const realtime = `${read("src/lib/voice/openai-phone-agent-runtime.ts")}\n${read(
      "src/lib/voice/openai-sip-session.ts",
    )}`;
    expect(realtime).not.toMatch(/ambientNoise|backgroundSound/);
  });

  it("outbound prompts are capped like inbound — no 500-row interpolation", () => {
    const nativeRuntime = read("src/lib/voice/openai-phone-agent-runtime.ts");
    expect(nativeRuntime).toContain("MAX_INITIAL_KNOWLEDGE_ITEMS");
    expect(nativeRuntime).toContain(".limit(40)");
    expect(nativeRuntime).toContain(".limit(80)");
    expect(nativeRuntime).not.toContain(".limit(500)");
    expect(read("src/lib/voice/openai-phone-agent-runtime.ts")).toContain(
      "clampRuntimePromptPreservingTail",
    );
  });

  it("retires public voice before provider work and caps authenticated PSTN sessions", () => {
    const publicRoutes = read("src/routes/marketing-runtime-routes.ts");
    const sipConfig = read("src/lib/voice/openai-sip-config.ts");
    const sipSession = read("src/lib/voice/openai-sip-session.ts");
    const inbound = read("src/routes/openai-inbound-twilio-routes.ts");
    expect(publicRoutes).toContain("res.status(410).json");
    expect(publicRoutes).toContain('code: "public_voice_preview_retired"');
    expect(publicRoutes).toContain('signupPath: "/signup?plan=free"');
    expect(publicRoutes).not.toMatch(
      /createServerManagedOpenAIRealtimeCall|createPublicOpenAILiveDemoCall|reserveRealtimeSessionSpend/,
    );
    expect(sipConfig).toContain("OPENAI_SIP_DEFAULT_MAX_SECONDS = 3_600");
    expect(sipSession).toContain("resolveOpenAISipSessionMaxSeconds() * 1_000");
    expect(inbound).toContain('timeLimit="${resolveOpenAISipSessionMaxSeconds()}"');
  });

  it("transferPhone backs up the escalation warm-transfer destination", () => {
    const handlers = read("src/lib/bot-tools/workflow.ts");
    expect(handlers).toContain("transferPhone: schema.agents.transferPhone");
    expect(handlers).toMatch(/row\?\.phone\?\.trim\(\) \|\| row\?\.transferPhone\?\.trim\(\)/);
  });

  it("realtime sessions are pinned to the platform model", () => {
    const service = read("src/lib/voice/openai-realtime-service.ts");
    const session = service.slice(service.indexOf("buildOpenAIRealtimeSessionConfig"));
    expect(session.slice(0, 1400)).toContain("model: OPENAI_REALTIME_DEFAULT_MODEL");
    expect(session.slice(0, 1400)).not.toContain("input.model?.trim() ||");
  });

  it("Microsoft token refresh writes back to the tagged source table", () => {
    const integrations = read("src/lib/integrations.ts");
    expect(integrations).toContain('__accountTable: "calendar" as const');
    expect(integrations).toContain('__accountTable: "mail" as const');
    expect(integrations).toContain('account.__accountTable === "calendar"');
  });

  it("the cookie consent notice is mounted and the deploy gate asserts the mount", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('import CookieConsent from "./components/CookieConsent";');
    expect(app).toContain("<CookieConsent />");
    expect(read("scripts/check-marketing-measurement-consent.mjs")).toContain(
      "must actually be MOUNTED",
    );
  });

  it("paywall copy names only plans that exist publicly", () => {
    for (const path of ["src/lib/trial-gate.ts", "src/lib/voice-wallet-guard.ts"]) {
      const source = read(path);
      expect(source).not.toContain("Choose Starter, Team, or Business");
    }
    expect(read("src/lib/trial-gate.ts")).toContain("Starter, Starter Plus, or Pro");
  });
});
