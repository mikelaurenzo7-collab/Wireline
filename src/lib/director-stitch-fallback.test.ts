import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStitchChatDesignGuidance,
  resolveStitchDirectorPath,
} from "./director-stitch-fallback";

vi.mock("./director-stitch-service", () => ({
  tryDirectorStitchTurn: vi.fn(),
}));

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

import { tryDirectorStitchTurn } from "./director-stitch-service";
import { GoogleStitchError } from "./google-stitch-mcp-client";

describe("director stitch fallback", () => {
  beforeEach(() => {
    vi.mocked(tryDirectorStitchTurn).mockReset();
  });

  const input = {
    userId: "user-1",
    operatorMessage: "Design a landing page for homeowners who need emergency plumbing",
    history: [] as Array<{ role: "operator" | "director"; content: string }>,
    stitchOptions: { designMode: true as const },
  };

  it("builds chat design guidance with design.md and html prototype instructions", () => {
    const md = "# Design brief — Acme";
    const guidance = buildStitchChatDesignGuidance(input.operatorMessage, md);
    expect(guidance).toContain("Wireline Design (chat mode");
    expect(guidance).toContain("```html");
    expect(guidance).toContain(md);
  });

  it("returns clarify turns as stitch without LLM fallback", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce({
      kind: "turn",
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
      ...input,
      operatorMessage: "Design a landing page",
    });
    expect(result.kind).toBe("stitch");
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

  it("configured Stitch with auth failure returns clear fail copy", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce({
      kind: "hard-failure",
      error: new GoogleStitchError("invalid API key", "AUTH_FAILED"),
    });

    const result = await resolveStitchDirectorPath(input);
    expect(result.kind).toBe("stitch-failed");
    if (result.kind === "stitch-failed") {
      expect(result.turn.reply).toMatch(/credentials|configuration/i);
      expect(result.turn.reply).toMatch(/admin/i);
      expect(result.turn.previews).toEqual([]);
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
      stitchOptions: { designMode: true },
    });
    expect(result.kind).toBe("stitch");
  });
});
