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

import { runCompletion, runStructured } from "./claude-structured";
import { runOpenRouterCompletion } from "./openrouter-structured";
import { DESIGN_KIT_BASE_CSS } from "./director-design-kit";

const builderDraftHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero"><h1 class="wl-headline">Summit Landscaping</h1>
<p class="wl-subhead">Licensed crews across Denver.</p><a href="#">Get a quote</a></header></body></html>`;

const opusFinishedHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero wl-hero--photo"><h1 class="wl-headline">Summit Landscaping</h1>
<p class="wl-subhead">Licensed crews across Denver.</p><div class="wl-cta-row">
<a class="wl-btn wl-btn--primary" href="#">Get a quote</a></div></header>
<section class="wl-section"><div class="wl-trust-row"><span class="wl-badge">Insured</span></div></section>
<!-- ${"padding ".repeat(200)} --></body></html>`;

describe("runDirectorDesignStudio Spectrum Desk", () => {
  beforeEach(() => {
    vi.mocked(runOpenRouterCompletion).mockReset();
    vi.mocked(runStructured).mockReset();
    vi.mocked(runCompletion).mockReset();
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
        operatorReply: "Your **Summit Landscaping** page is ready.",
        pageTitle: "Summit Landscaping",
      };
    });

    vi.mocked(runCompletion).mockResolvedValue({
      text: opusFinishedHtml,
      cacheRead: 0,
      cacheCreate: 0,
    });

    vi.mocked(runOpenRouterCompletion).mockResolvedValue(builderDraftHtml);
  }

  it("runs Opus vision, Kimi build, Opus implement via completion, sign-off, and packages preview", async () => {
    mockPipeline();

    const turn = await runDirectorDesignStudio(baseInput);

    expect(runStructured).toHaveBeenCalledTimes(2);
    expect(runCompletion).toHaveBeenCalledTimes(1);
    expect(runOpenRouterCompletion).toHaveBeenCalledTimes(1);
    expect(turn.previews).toHaveLength(1);
    expect(turn.reply).toContain("Summit Landscaping");
    expect(turn.thinkingSummary).toMatch(/Opus vision/i);
    expect(turn.thinkingSummary).toMatch(/Kimi build/i);
    expect(turn.designBriefMarkdown).toMatch(/Opus creative vision/i);
  });

  it("does not run research, critique loops, or second builder passes", async () => {
    mockPipeline();

    await runDirectorDesignStudio(baseInput);

    const users = vi.mocked(runOpenRouterCompletion).mock.calls.map((c) => c[0].user);
    const systems = vi.mocked(runOpenRouterCompletion).mock.calls.map((c) => c[0].system ?? "");

    expect(runOpenRouterCompletion).toHaveBeenCalledTimes(1);
    expect(systems.some((s) => /layout scout/i.test(s))).toBe(false);
    expect(users.some((u) => /critique/i.test(u))).toBe(false);
  });

  it("keeps builder draft when Opus implement returns thin HTML", async () => {
    mockPipeline();
    vi.mocked(runCompletion).mockResolvedValue({
      text: "<html><body>stub</body></html>",
      cacheRead: 0,
      cacheCreate: 0,
    });

    await runDirectorDesignStudio(baseInput);

    const signoffUser = vi.mocked(runStructured).mock.calls.at(-1)?.[0].user ?? "";
    expect(signoffUser).toContain("wl-headline");
  });
});
