import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStitchChatDesignGuidance,
  resolveStitchDirectorPath,
} from "./director-stitch-fallback";

vi.mock("./director-design-orchestrator", () => ({
  runDirectorDesignStudio: vi.fn(),
}));

vi.mock("./director-stitch-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./director-stitch-service")>();
  return {
    ...actual,
    tryDirectorStitchTurn: vi.fn(),
    prepareStitchDirectorTurn: vi.fn(),
  };
});

vi.mock("./director-stitch-session", () => ({
  loadLatestStitchSession: vi.fn().mockResolvedValue(null),
}));

vi.mock("./director-stitch-brief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./director-stitch-brief")>();
  return {
    ...actual,
    loadStitchTenantBranding: vi.fn().mockResolvedValue({
      brandName: "Acme",
      brandLogoUrl: null,
      primaryColor: "#C45A11",
      businessName: "Acme Plumbing",
      businessType: "plumbing",
      primaryProduct: "Drain cleaning",
    }),
  };
});

import { runDirectorDesignStudio } from "./director-design-orchestrator";
import { prepareStitchDirectorTurn, tryDirectorStitchTurn } from "./director-stitch-service";
import { GoogleStitchError } from "./google-stitch-mcp-client";

describe("director stitch fallback", () => {
  beforeEach(() => {
    vi.mocked(tryDirectorStitchTurn).mockReset();
    vi.mocked(prepareStitchDirectorTurn).mockReset();
    vi.mocked(runDirectorDesignStudio).mockReset();
  });

  const input = {
    userId: "user-1",
    operatorMessage: "Design a landing page for homeowners who need emergency plumbing",
    history: [] as Array<{ role: "operator" | "director"; content: string }>,
    stitchOptions: { designMode: true as const, useStitchPixelRender: true as const },
  };

  const studioInput = {
    ...input,
    stitchOptions: { designMode: true as const },
  };

  it("builds chat design guidance with design.md and html prototype instructions", () => {
    const md = "# Design brief — Acme";
    const guidance = buildStitchChatDesignGuidance(input.operatorMessage, md);
    expect(guidance).toContain("Wireline Design (chat mode");
    expect(guidance).toContain("```html");
    expect(guidance).toContain(md);
  });

  it("routes design mode to Design Studio by default", async () => {
    vi.mocked(prepareStitchDirectorTurn).mockResolvedValueOnce({
      phase: "render",
      input: {
        ...studioInput,
        designBriefMarkdown: "# brief",
      },
    });
    vi.mocked(runDirectorDesignStudio).mockResolvedValueOnce({
      reply: "Your page is ready.",
      previews: [{ conceptId: "d1", title: "Page", rationale: "", previewDataUrl: "" }],
      artifacts: [],
      thinkingSummary: "Build",
      durationMs: 100,
    });

    const result = await resolveStitchDirectorPath(studioInput);
    expect(result.kind).toBe("stitch");
    expect(runDirectorDesignStudio).toHaveBeenCalled();
    expect(tryDirectorStitchTurn).not.toHaveBeenCalled();
  });

  it("returns clarify turns as stitch without LLM fallback", async () => {
    vi.mocked(prepareStitchDirectorTurn).mockResolvedValueOnce({
      phase: "clarify",
      turn: {
        reply: "Before I generate screens, I need a bit more context.",
        previews: [],
        artifacts: [{ name: "design.md" }],
        clarifyingQuestions: ["Who is the primary audience?"],
        thinkingSummary: "Gathering design requirements",
        durationMs: 5,
      },
    });

    const result = await resolveStitchDirectorPath({
      ...studioInput,
      operatorMessage: "Design a landing page",
    });
    expect(result.kind).toBe("stitch");
    expect(runDirectorDesignStudio).not.toHaveBeenCalled();
  });

  it("returns stitch turn when render succeeds", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce({
      kind: "turn",
      turn: {
        reply: "Rendered",
        previews: [{ kind: "stitch" }],
        artifacts: [],
        thinkingSummary: "Done",
        durationMs: 10,
      },
    });

    const result = await resolveStitchDirectorPath(input);
    expect(result.kind).toBe("stitch");
    if (result.kind === "stitch") {
      expect(result.turn.reply).toBe("Rendered");
    }
  });

  it("unconfigured Stitch continues using LLM fallback", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce({ kind: "not-configured" });

    const result = await resolveStitchDirectorPath(input);
    expect(result.kind).toBe("llm-fallback");
    if (result.kind === "llm-fallback") {
      expect(result.fallback.deliverableGuidance).toContain("design.md");
      expect(result.fallback.artifacts[0]).toMatchObject({
        artifactType: "stitch-design-brief",
        name: "design.md",
      });
    }
  });

  it("configured Stitch with transient render failure uses LLM fallback", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce({
      kind: "recoverable-failure",
      error: new GoogleStitchError("Stitch returned no screens", "VALIDATION_ERROR", true),
    });

    const result = await resolveStitchDirectorPath(input);
    expect(result.kind).toBe("llm-fallback");
    if (result.kind === "llm-fallback") {
      expect(result.fallback.deliverableGuidance).toContain("Wireline Design (chat mode");
      expect(result.fallback.artifacts[0]).toMatchObject({ name: "design.md" });
    }
  });

  it("configured Stitch with auth failure still falls back to chat design", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce({
      kind: "hard-failure",
      error: new GoogleStitchError("invalid API key", "AUTH_FAILED"),
    });

    const result = await resolveStitchDirectorPath(input);
    expect(result.kind).toBe("llm-fallback");
    if (result.kind === "llm-fallback") {
      expect(result.fallback.deliverableGuidance).toContain("GOOGLE_STITCH_API_KEY");
      expect(result.fallback.artifacts[0]).toMatchObject({ name: "design.md" });
    }
  });

  it("configured Stitch with hard transport failure falls back to chat design", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce({
      kind: "hard-failure",
      error: new GoogleStitchError("Stitch Transport Error", "TOOL_ERROR", false),
    });

    const result = await resolveStitchDirectorPath(input);
    expect(result.kind).toBe("llm-fallback");
    if (result.kind === "llm-fallback") {
      expect(result.fallback.deliverableGuidance).toContain("live render did not finish");
    }
  });

  it("ignores non-stitch operator messages", async () => {
    const result = await resolveStitchDirectorPath({
      ...input,
      operatorMessage: "How is my fleet doing this week?",
      stitchOptions: undefined,
    });
    expect(result.kind).toBe("none");
    expect(tryDirectorStitchTurn).not.toHaveBeenCalled();
  });

  it("routes clarify follow-ups without design keywords", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce({
      kind: "turn",
      turn: {
        reply: "Rendered",
        previews: [{ kind: "stitch" }],
        artifacts: [],
        thinkingSummary: "Done",
        durationMs: 10,
      },
    });

    const result = await resolveStitchDirectorPath({
      userId: "user-1",
      operatorMessage: "Stillmind is a consumer meditation app for stressed professionals.",
      history: [
        {
          role: "operator",
          content:
            "Design a minimal mobile onboarding screen for a meditation app called Stillmind",
        },
        {
          role: "director",
          content:
            "Before I generate screens, I need a bit more context (business, audience, goal).",
        },
      ],
      stitchOptions: { designMode: true, useStitchPixelRender: true },
    });
    expect(result.kind).toBe("stitch");
  });
});
