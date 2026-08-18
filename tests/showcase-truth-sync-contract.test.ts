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

type ModelConfig = {
  provider?: string;
  model?: string;
  fallbackModels?: string[];
  messages?: Array<{ role?: string; content?: unknown }>;
};

function modelFrom(payload: Record<string, unknown>): ModelConfig {
  return (payload.model || {}) as ModelConfig;
}

function promptFrom(payload: Record<string, unknown>): string {
  const system = modelFrom(payload).messages?.find((message) => message.role === "system");
  return typeof system?.content === "string" ? system.content : "";
}

function markedPayload(model: ModelConfig): Record<string, unknown> {
  return {
    model: {
      ...model,
      messages: [
        {
          role: "system",
          content: "You are Ria, the Demo Concierge showcase demo built by Wireline.",
        },
      ],
    },
  };
}

describe("public showcase truth guard", () => {
  const publicAgents = [
    ...WIRELINE_CONTACT_AGENTS.map((agent) => ({ agent, kind: "cs" as const })),
    ...WIRELINE_DEMO_AGENTS.map((agent) => ({ agent, kind: "demo" as const })),
  ];

  it.each(publicAgents)(
    "sanitizes $agent.name without stale claims or cross-provider fallbacks",
    ({ agent, kind }) => {
      const payload = sanitizeShowcaseAssistantPayload(
        buildShowcaseAssistantPayload(agent, kind, {
          webhookSecret: "test-webhook-secret",
        }) as Record<string, unknown>,
      );
      const prompt = promptFrom(payload);
      const model = modelFrom(payload);

      expect(prompt).toContain("Pricing:");
      expect(prompt).toContain("when connected and currently available");
      expect(prompt).not.toMatch(
        /auditor engaged|target Q4 2026|on request \(~30 day onboarding\)|BAA available on the Enterprise roadmap/i,
      );
      expect(prompt).not.toMatch(/14-day free trial|Personal \$49|Starter \$149|Pro \$499/i);
      expect(prompt).not.toContain("HIPAA-aware tone");

      expect(model.provider).toBe("xai");
      expect(model.model).toBe("grok-4.3");
      expect(model.fallbackModels).toBeUndefined();

      if (kind === "demo") {
        expect(prompt).not.toMatch(/have someone follow up/i);
        expect(prompt).toContain("never promise human follow-up from a demo line");
        expect(prompt).toContain("Never tell the caller");
      }
    },
  );

  it("keeps canonical source knowledge conservative before the last-mile guard", () => {
    expect(
      WIRELINE_INTEGRATIONS.every((name) =>
        /when connected|when configured|where supported|billing/i.test(name),
      ),
    ).toBe(true);
    const roadmap = WIRELINE_COMPLIANCE_STATUS.inProgress.join(" ");
    expect(roadmap).toContain("not SOC 2 certified today");
    expect(roadmap).toContain("not currently available");
    expect(roadmap).not.toMatch(/auditor engaged|target Q4|on request|30 day onboarding/i);
    const marcusScope = WIRELINE_DEMO_AGENTS.find((agent) => agent.name === "Marcus")?.scope || "";
    expect(marcusScope).toContain("HIPAA and BAA support are not currently available");
    expect(marcusScope).not.toMatch(/BAA available|Enterprise roadmap/i);
  });

  it("rewrites stale truth and cross-provider fallback values", () => {
    const stale = {
      model: {
        provider: "openai",
        model: "gpt-4o",
        fallbackModels: ["gemini-3.5-flash"],
        messages: [
          {
            role: "system",
            content:
              "You are Ria, the Demo Concierge showcase demo built by Wireline.\n" +
              "- Integrations: everything, and more.\n" +
              "SOC 2 Type II - auditor engaged, target Q4 2026\n" +
              "HIPAA BAA - Enterprise tier only, on request (~30 day onboarding)\n" +
              "Healthcare-style demo; not currently HIPAA-certified (BAA available on the Enterprise roadmap).\n" +
              "- If something goes wrong with a tool or action, never say 'error' or any technical term. Just say 'Let me note that and have someone follow up' and move on.",
          },
        ],
      },
    };

    const guarded = sanitizeShowcaseAssistantPayload(stale);
    const prompt = promptFrom(guarded);
    const model = modelFrom(guarded);
    expect(prompt).toContain("not SOC 2 certified today");
    expect(prompt).toContain("not currently available");
    expect(prompt).toContain("never promise human follow-up from a demo line");
    expect(prompt).not.toMatch(/auditor engaged|have someone follow up|BAA available/i);
    expect(model.fallbackModels).toEqual(["gpt-5.6-luna"]);
  });

  it("never inserts an OpenAI primary model as its own fallback", () => {
    const guarded = sanitizeShowcaseAssistantPayload(
      markedPayload({
        provider: "openai",
        model: "gpt-5.6-luna",
        fallbackModels: ["gpt-5.6-luna", "gemini-3.5-flash"],
      }),
    );
    expect(modelFrom(guarded).fallbackModels).toBeUndefined();
  });

  it("never inserts a Google primary model as its own fallback", () => {
    const guarded = sanitizeShowcaseAssistantPayload(
      markedPayload({
        provider: "google",
        model: "gemini-2.5-flash",
        fallbackModels: ["gemini-2.5-flash", "gpt-4o"],
      }),
    );
    expect(modelFrom(guarded).fallbackModels).toBeUndefined();
  });

  it("strips fallbackModels from xAI showcase payloads", () => {
    const guarded = sanitizeShowcaseAssistantPayload(
      markedPayload({
        provider: "xai",
        model: "grok-4.3",
        fallbackModels: ["grok-4.20-0309-non-reasoning", "gpt-4o"],
      }),
    );
    expect(modelFrom(guarded).provider).toBe("xai");
    expect(modelFrom(guarded).model).toBe("grok-4.3");
    expect(modelFrom(guarded).fallbackModels).toBeUndefined();
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

  it("preflights the full provider fleet before the mutation loop", () => {
    const sync = read("scripts/sync-wireline-showcase.mts");
    const preflight = sync.indexOf("const targets = preflightTargets(");
    const mutationLoop = sync.indexOf("for (const target of targets)", preflight);
    expect(preflight).toBeGreaterThan(-1);
    expect(mutationLoop).toBeGreaterThan(preflight);
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
