import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Fast Start brief-first flow contract", () => {
  const create = read("src/components/CreateAgentDialog.tsx");

  it("keeps creation on one brief-first screen with optional role starters", () => {
    expect(create).toContain("{language.setupPrompt}");
    expect(create).toContain("Start from a Role");
    expect(create).not.toContain("{language.setupDescription}");
    expect(create).toContain("BOT_ROLE_TEMPLATES.map");
    expect(create).toContain("BOT_CHANNELS.map");
    expect(create).toContain('aria-label="Bot role starters"');
    expect(create).toContain("aria-expanded={customizing}");
    expect(create).toContain("Describe the Job");
    expect(create).toContain("language.createCta");
    expect(create).toContain("Cancel");
    expect(create).not.toContain("useState<1 | 2>(1)");
    expect(create).not.toMatch(/Step [12] ·/);
    expect(create).not.toContain("continueToVoice");
  });

  it("starts custom creation empty while preserving explicit template intent", () => {
    expect(create).toContain('BOT_ROLE_TEMPLATES.find((template) => template.key === "custom")');
    expect(create).toContain(
      'setBrief(initialBrief || (nextTemplate.key === "custom" ? "" : nextTemplate.summary))',
    );
    expect(create).toContain("briefIsTemplateTextRef.current");
    expect(create).toContain('template.key === "custom" ? "" : template.summary');
    expect(create).toContain("const finalBrief = brief.trim() || selectedTemplate.summary");
    expect(create).toContain("if (finalBrief) {");
    expect(create).not.toContain("defaultBrief");
  });

  it("creates a technical agent record but emits one-workspace Bot product semantics", () => {
    expect(create).toContain('authFetch("/api/agents"');
    expect(create).toContain("TECHNICAL_ROLE_BY_TEMPLATE");
    expect(create).toContain('workspace_model: "one_workspace"');
    expect(create).toContain('object: "bot"');
    expect(create).not.toMatch(/setPosture|rolesForPosture/);
  });

  it("hands off into Studio with the resumable post-create wizard", () => {
    expect(create).toContain("stashPostCreateWizard(wizardPayload)");
    expect(create).toContain("onCreated?.(wizardPayload)");
    expect(create).toContain("phoneProvisionRequested: false");
    expect(create).toMatch(
      /navigate\(`\/studio\?agent=\$\{encodeURIComponent\(body\.id\)\}&section=setup`/,
    );
  });
});
