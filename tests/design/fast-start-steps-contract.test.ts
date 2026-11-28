import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Bo's first conversation flow contract", () => {
  const create = read("src/components/onboarding/BoOnboarding.tsx");
  const studioHome = read("src/pages/AgentStudioHome.tsx");

  it("keeps creation in one in-page conversation that opens on the business, without a role gallery", () => {
    expect(create).toContain(
      'const QUESTION_STEPS = ["about", "website", "questions", "checks"] as const;',
    );
    // A ?brief= link or a browser-extension capture becomes Bo's first answer.
    expect(create).toContain("initialAbout.slice(0, BO_ANSWER_MAX_CHARS)");
    expect(studioHome).toMatch(
      /<StudioPageShell>\s*<BoOnboarding key=\{user\?\.id\} initialAbout=\{brief\} \/>/,
    );
    // It is part of the Workspace page, not a modal over it.
    expect(create).not.toMatch(/role="dialog"|aria-modal|useModalFocusTrap/);
    expect(create).not.toContain("Start from a Role");
    expect(create).not.toContain("BOT_ROLE_TEMPLATES");
    expect(create).not.toContain('aria-label="Bot role starters"');
    // The voice is chosen afterwards in Set Up, not as a step of creation.
    expect(create).not.toContain("SimpleVoicePicker");
  });

  it("starts Bo without template text while honoring a personal starter link", () => {
    expect(create).toMatch(
      /isPersonalStarter\(\s*params\.get\("template"\),\s*getStoredSignupIntent\(\)\?\.preferredTemplateId,?\s*\)/,
    );
    expect(create).toContain("is_business_agent: !personal,");
    expect(create).toContain('useState(stored ? "" : initialAbout.slice(0, BO_ANSWER_MAX_CHARS))');
    expect(create).not.toMatch(/nextTemplate|selectedTemplate|template\.summary/);
  });

  it("creates a technical agent record but emits one-workspace Bot product semantics", () => {
    expect(create).toContain('authFetch("/api/agents"');
    expect(create).toContain('workspace_model: "one_workspace"');
    expect(create).toContain('object: "bot"');
    expect(create).toContain('source: "bo_onboarding"');
    expect(create).not.toMatch(/setPosture|rolesForPosture/);
  });

  it("hands off into Studio from a conversation that resumes after a reload", () => {
    expect(create).toContain("writeBoOnboarding(userId, {");
    expect(studioHome).toContain("agents.some((agent) => agent.id === onboarding?.agentId)");
    expect(create).toMatch(
      /function finish\(destination: string\) \{\s*clearBoOnboarding\(userId\);\s*setPostSignupFlowActive\(false\);\s*navigate\(destination\);\s*\}/,
    );
    expect(create).toContain("finish(`/studio?agent=${id}`)");
    expect(create).toContain("finish(`/studio?agent=${id}&workroom=test`)");
  });
});
