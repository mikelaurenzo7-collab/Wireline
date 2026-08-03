import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
} from "../src/data/contact-agents";
import {
  WIRELINE_COMPLIANCE_STATUS,
  WIRELINE_INTEGRATIONS,
} from "../src/data/wireline-knowledge";
import { buildShowcaseAssistantPayload } from "../src/lib/showcase-assistant";
import { sanitizeShowcaseAssistantPayload } from "../src/lib/showcase-prompt-truth-guard";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function promptFrom(payload: Record<string, unknown>): string {
  const messages = (payload.model as { messages?: Array<{ role?: string; content?: unknown }> })
    ?.messages;
  const system = messages?.find((message) => message.role === "system");
  return typeof system?.content === "string" ? system.content : "";
}

describe("public showcase truth guard", () => {
  const publicAgents = [
    ...WIRELINE_CONTACT_AGENTS.map((agent) => ({ agent, kind: "cs" as const })),
    ...WIRELINE_DEMO_AGENTS.map((agent) => ({ agent, kind: "demo" as const })),
  ];

  it.each(publicAgents)("sanitizes $agent.name without stale commercial or compliance claims", ({
    agent,
    kind,
  }) => {
    const payload = sanitizeShowcaseAssistantPayload(
      buildShowcaseAssistantPayload(agent, kind, {
        webhookSecret: "test-webhook-secret",
      }) as Record<string, unknown>,
    );
    const prompt = promptFrom(payload);

    expect(prompt).toContain("Current").or.toContain("Pricing:");
    expect(prompt).toContain("when connected and currently available");
    expect(prompt).not.toMatch(/auditor engaged|target Q4 2026|on request \(~30 day onboarding\)/i);
    expect(prompt).not.toMatch(/14-day free trial|Personal \$49|Starter \$149|Pro \$499/i);
    expect(prompt).not.toContain("HIPAA-aware tone");
    if (kind === "demo") {
      expect(prompt).not.toMatch(/have someone follow up|someone will reach out/i);
      expect(prompt).toContain("never promise human follow-up from a demo line");
    }
  });

  it("keeps canonical source knowledge conservative before the last-mile guard", () => {
    expect(WIRELINE_INTEGRATIONS.every((name) => /when connected|when configured|where supported|billing/i.test(name))).toBe(true);
    const roadmap = WIRELINE_COMPLIANCE_STATUS.inProgress.join(" ");
    expect(roadmap).toContain("not SOC 2 certified today");
    expect(roadmap).toContain("not currently available");
    expect(roadmap).not.toMatch(/auditor engaged|target Q4|on request|30 day onboarding/i);
  });

  it("rewrites a stale provider payload and rejects any forbidden claim left behind", () => {
    const stale = {
      model: {
        messages: [
          {
            role: "system",
            content:
              "You are Ria, the Demo Concierge showcase demo built by Wireline.\n" +
              "- Integrations: everything, and more.\n" +
              "SOC 2 Type II - auditor engaged, target Q4 2026\n" +
              "HIPAA BAA - Enterprise tier only, on request (~30 day onboarding)\n" +
              "- If something goes wrong with a tool or action, never say 'error' or any technical term. Just say 'Let me note that and have someone follow up' and move on.",
          },
        ],
      },
    };

    const guarded = sanitizeShowcaseAssistantPayload(stale);
    const prompt = promptFrom(guarded);
    expect(prompt).toContain("not SOC 2 certified today");
    expect(prompt).toContain("not currently available");
    expect(prompt).toContain("never promise human follow-up from a demo line");
    expect(prompt).not.toMatch(/auditor engaged|have someone follow up/i);
  });
});

describe("showcase synchronization boundary", () => {
  it("guards dynamic webhook responses before the Vapi router", () => {
    const registration = read("src/server/register-api-routes.ts");
    const guard = registration.indexOf(
      'app.use("/api/vapi-webhook", showcasePromptTruthGuard)',
    );
    const vapi = registration.indexOf("app.use(vapiRouter)");
    expect(guard).toBeGreaterThan(-1);
    expect(vapi).toBeGreaterThan(guard);
  });

  it("preflights the full provider fleet before the first PATCH", () => {
    const sync = read("scripts/sync-wireline-showcase.mts");
    const preflight = sync.indexOf("const targets = preflightTargets(");
    const firstPatch = sync.indexOf("await patchAssistant(");
    expect(preflight).toBeGreaterThan(-1);
    expect(firstPatch).toBeGreaterThan(preflight);
    expect(sync).toContain("Showcase preflight failed before provider mutation");
    expect(sync).toContain("sanitizeShowcaseAssistantPayload(");
    expect(sync).toContain("counts.patched !== targets.length");
  });

  it("runs provider mutation only from an explicitly marked production build", () => {
    const build = read("scripts/vercel-build.mjs");
    expect(build).toContain('environment !== "production"');
    expect(build).toContain('commitMessage.includes("[sync-showcase]")');
    expect(build).toContain("Refusing showcase synchronization from a duplicate Vercel project");
    expect(build).toContain("syncShowcaseIfRequested();");

    const bundle = build.indexOf('"--outfile=dist/chatgpt-mcp-api.cjs"');
    const sync = build.lastIndexOf("syncShowcaseIfRequested();");
    expect(sync).toBeGreaterThan(bundle);
  });
});
