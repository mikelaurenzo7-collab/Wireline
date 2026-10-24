import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Final launch-certification contract: keep runtime privacy, public trust copy,
// and operator runbooks pinned to the same production truth.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch artifact privacy and operations truth", () => {
  it("keeps OpenAI SIP call recording an owner choice: off by default, disclosure tied to the same flag", () => {
    const session = read("src/lib/voice/openai-sip-session.ts");
    const runtime = read("src/lib/voice/openai-live-agent-service.ts");
    expect(session).toContain("transcript: input.transcript || null");
    // The session never stores audio itself. It only carries the Bot owner's
    // per-Bot choice into the spoken opening: the recording notice is composed
    // from input.callRecordingEnabled, the same flag that enables carrier
    // capture on the Twilio bridges (see live-call-recording-contract).
    expect(session).toContain("recordingEnabled: input.callRecordingEnabled === true");
    expect(read("src/lib/voice/inbound-opening.ts")).toContain(
      "this call may be recorded for quality and compliance",
    );
    expect(session).not.toMatch(/recordingUrl|recording_url|videoRecording|pcap/i);
    expect(runtime).not.toMatch(/api\.x\.ai|api\.vapi\.ai|elevenlabs|11labs/i);
  });

  it("retires unauthenticated browser voice without retaining a provider path", () => {
    const route = read("src/routes/marketing-runtime-routes.ts");
    const landing = read("src/components/marketing/WireAgentLanding.tsx");
    const showcase = read("src/pages/Showcase.tsx");

    expect(route).toContain("function publicVoicePreviewRetired");
    expect(route).toContain("res.status(410).json");
    expect(route).toContain('code: "public_voice_preview_retired"');
    expect(route).toContain('"/api/public/demo-call"');
    expect(route).not.toMatch(/OpenAI|VAPI|createServerManagedOpenAIRealtimeCall|runInBackground/);
    expect(landing).not.toMatch(/BrowserCallWidget|useProtectedPublicDemo|demo-session/);
    expect(showcase).toContain('<Navigate to="/signup" replace />');
  });

  it("keeps public retention and recording claims aligned with runtime defaults", () => {
    const security = read("src/components/Security.tsx");
    expect(security).toContain("365 days by default; supported range 90 to 365 days");
    expect(security).toContain("Provider audio recording of full calls is off by default");
    expect(security).toContain("callers hear a recording notice at the start of a recorded call");
    expect(security).not.toContain("transcript retention defaults to 90 days");
  });

  it("does not publish unsupported self-serve SLA or recovery guarantees", () => {
    const sla = read("docs/SLA.md");
    expect(sla).toContain("do **not** include a contractual uptime SLA");
    expect(sla).toContain("365-day default, minimum 90 days, and a supported 90 to 365 day range");
    expect(sla).not.toContain("99.95%");
    expect(sla).not.toContain("Dedicated Slack channel");
    expect(sla).not.toContain("Synthetic monitoring:");
    expect(sla).not.toContain("point-in-time recovery (30 days)");
  });

  it("documents only monitoring cadences that exist in deployed configuration", () => {
    const runbook = read("docs/INCIDENT_RESPONSE.md");
    const vercel = JSON.parse(read("vercel.json")) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };
    expect(vercel.crons).toEqual(
      expect.arrayContaining([
        { path: "/api/jobs/sweep", schedule: "* * * * *" },
        { path: "/api/daily-brief/schedule", schedule: "*/15 * * * *" },
      ]),
    );
    expect(runbook).toContain("`/api/jobs/sweep` every **minute**");
    expect(runbook).toContain("`/api/daily-brief/schedule` every **15 minutes**");
    expect(runbook).toContain("The former public demo-line canary is retired");
    expect(runbook).toContain("Do not reintroduce a paid synthetic call");
    expect(runbook).not.toContain("**nightly** schedule");
    expect(runbook).not.toContain("Uptime monitor → SMS + email");
    expect(runbook).not.toContain("Vercel cron → Slack");
  });
});
