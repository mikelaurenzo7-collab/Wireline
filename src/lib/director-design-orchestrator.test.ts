import { beforeEach, describe, expect, it, vi } from "vitest";
import { runDirectorDesignStudio } from "./director-design-orchestrator";

vi.mock("./openrouter-structured", () => ({
  isOpenRouterConfigured: vi.fn().mockReturnValue(true),
  runOpenRouterCompletion: vi.fn(),
  runOpenRouterStructured: vi.fn(),
  runOpenRouterImageGeneration: vi.fn().mockResolvedValue([]),
}));

vi.mock("./claude-structured", () => ({
  runCompletion: vi.fn(),
  runStructured: vi.fn(),
}));

vi.mock("./director-html-prototype", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./director-html-prototype")>();
  return {
    ...actual,
    packageDirectorHtmlPrototypePreview: vi.fn().mockResolvedValue({
      preview: {
        conceptId: "design-abc",
        title: "Summit Landscaping",
        rationale: "Wireline Design",
        kind: "stitch",
        previewDataUrl: "",
        htmlDownloadUrl: "/api/director/artifacts/signed",
        htmlArtifactId: "art-1",
        deviceType: "DESKTOP",
      },
      artifacts: [{ id: "art-1", name: "design.html" }],
    }),
  };
});

import { runStructured } from "./claude-structured";
import { runOpenRouterCompletion } from "./openrouter-structured";
import { DESIGN_KIT_BASE_CSS } from "./director-design-kit";

const grokDraftHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero"><h1 class="wl-headline">Summit Landscaping</h1>
<p class="wl-subhead">Licensed crews across Denver.</p><a href="#">Get a quote</a></header></body></html>`;

const opusFinishedHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero wl-hero--photo"><h1 class="wl-headline">Summit Landscaping</h1>
<p class="wl-subhead">Licensed crews across Denver.</p><div class="wl-cta-row">
<a class="wl-btn wl-btn--primary" href="#">Get a quote</a></div></header>
<section class="wl-section"><div class="wl-trust-row"><span class="wl-badge">Insured</span></div></section></body></html>`;

describe("runDirectorDesignStudio Spectrum Desk", () => {
  beforeEach(() => {
    vi.mocked(runOpenRouterCompletion).mockReset();
    vi.mocked(runStructured).mockReset();
  });

  const baseInput = {
    userId: "user-1",
    operatorMessage: "Design a landing page for Summit Landscaping homeowners",
    designBriefMarkdown: "# Design brief\nAudience: Denver homeowners",
    history: [],
    stitchOptions: { designMode: true as const },
  };

  function mockPipeline() {
    let structuredCall = 0;
    vi.mocked(runStructured).mockImplementation(async () => {
      structuredCall += 1;
      if (structuredCall === 1) {
        return {
          creativeVision: "Navy + cream alpine landscaping hero with phone-first CTA.",
          designBriefExtension: "## Section map\nHero → trust → services",
        };
      }
      return {
        html: opusFinishedHtml,
        operatorReply: "Your **Summit Landscaping** page is ready.",
        pageTitle: "Summit Landscaping",
      };
    });

    vi.mocked(runOpenRouterCompletion).mockResolvedValue(grokDraftHtml);
  }

  it("runs Opus vision, single Grok build, Opus finish, and packages preview", async () => {
    mockPipeline();

    const turn = await runDirectorDesignStudio(baseInput);

    expect(runStructured).toHaveBeenCalledTimes(2);
    expect(runOpenRouterCompletion).toHaveBeenCalledTimes(1);
    expect(turn.previews).toHaveLength(1);
    expect(turn.reply).toContain("Summit Landscaping");
    expect(turn.thinkingSummary).toMatch(/Opus vision/i);
    expect(turn.thinkingSummary).toMatch(/Grok build/i);
    expect(turn.thinkingSummary).toMatch(/Opus finish/i);
    expect(turn.designBriefMarkdown).toMatch(/Opus creative vision/i);
  });

  it("does not run research, critique loops, or second Grok passes", async () => {
    mockPipeline();

    await runDirectorDesignStudio(baseInput);

    const users = vi.mocked(runOpenRouterCompletion).mock.calls.map((c) => c[0].user);
    const systems = vi.mocked(runOpenRouterCompletion).mock.calls.map((c) => c[0].system ?? "");

    expect(runOpenRouterCompletion).toHaveBeenCalledTimes(1);
    expect(systems.some((s) => /layout scout/i.test(s))).toBe(false);
    expect(users.some((u) => /critique/i.test(u))).toBe(false);
    expect(users.some((u) => /localize/i.test(u))).toBe(false);
  });
});
