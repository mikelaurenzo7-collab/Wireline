import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Final launch-certification contract: keep runtime privacy, public trust copy,
// and operator runbooks pinned to the same production truth.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("launch artifact privacy and operations truth", () => {
  it("uses one transcript-only Vapi artifact policy across managed call surfaces", () => {
    const policy = read("src/lib/vapi-artifact-plan.ts");
    expect(policy).toContain("recordingEnabled: false");
    expect(policy).toContain("videoRecordingEnabled: false");
    expect(policy).toContain("pcapEnabled: false");
    expect(policy).toContain("loggingEnabled: true");
    expect(policy).toContain("transcriptPlan: { enabled: true }");

    for (const path of [
      "src/lib/vapi-assistant-factory-v2.ts",
      "src/lib/vapi-client.ts",
      "src/routes/vapi-v2.ts",
      "scripts/sync-wireline-showcase.mts",
    ]) {
      expect(read(path), path).toContain("buildVapiTranscriptOnlyArtifactPlan");
    }

    expect(read("src/lib/vapi-assistant-factory-v2.ts")).toContain("artifactPlan,");
    expect(read("src/lib/vapi-client.ts")).toContain("artifactPlan,");
    expect(read("src/routes/vapi-v2.ts")).toContain("artifactPlan:");
    expect(read("scripts/sync-wireline-showcase.mts")).toContain(
      "payload.artifactPlan = buildVapiTranscriptOnlyArtifactPlan();",
    );
  });

  it("makes unauthenticated browser proof shorter, private, and non-retained", () => {
    const policy = read("src/lib/public-browser-demo.ts");
    const route = read("src/routes/marketing-runtime-routes.ts");
    const hook = read("src/hooks/useProtectedPublicDemo.ts");
    const widget = read("src/components/marketing/BrowserCallWidget.tsx");
    const budget = read("src/lib/public-demo-budget.ts");

    expect(policy).toContain("PUBLIC_BROWSER_DEMO_MAX_SECONDS = 45");
    expect(policy).toContain("recordingEnabled: false");
    expect(policy).toContain("loggingEnabled: false");
    expect(policy).toContain("transcriptPlan: { enabled: false }");
    expect(route).toContain("process.env.VAPI_PRIVATE_KEY");
    expect(route).toContain('router.post("/api/public/demo-vapi/call/web"');
    expect(route).toContain("buildPublicBrowserDemoArtifactPlan()");
    expect(hook).toContain('fetch("/api/public/demo-session"');
    expect(widget).not.toContain("VITE_VAPI_PUBLIC_KEY");
    expect(widget).not.toContain("/api/public/assistant/");
    expect(budget).toContain("distributedLimiterStatus");
    expect(budget).toContain('bucket: "public-demo-global-daily"');
  });

  it("keeps public retention and recording claims aligned with runtime defaults", () => {
    const security = read("src/components/Security.tsx");
    expect(security).toContain("365-day default; supported range 90 to 365 days");
    expect(security).toContain("Managed full-call provider audio recording is disabled by default");
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
        { path: "/api/jobs/sweep", schedule: "*/5 * * * *" },
        { path: "/api/daily-brief/schedule", schedule: "*/15 * * * *" },
      ]),
    );
    expect(runbook).toContain("`/api/jobs/sweep` every **5 minutes**");
    expect(runbook).toContain("`/api/daily-brief/schedule` every **15 minutes**");
    expect(runbook).toContain("**nightly** schedule");
    expect(runbook).toContain("is **not** a paid synthetic call every 15 minutes");
    expect(runbook).not.toContain("Uptime monitor → SMS + email");
    expect(runbook).not.toContain("Vercel cron → Slack");
  });
});
