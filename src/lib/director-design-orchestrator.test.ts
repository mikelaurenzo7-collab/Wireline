import { beforeEach, describe, expect, it, vi } from "vitest";
import { runDirectorDesignStudio } from "./director-design-orchestrator";

vi.mock("./openrouter-structured", () => ({
  isOpenRouterConfigured: vi.fn().mockReturnValue(true),
  runOpenRouterCompletion: vi.fn(),
  runOpenRouterImageGeneration: vi.fn().mockResolvedValue([]),
}));

vi.mock("./director-design-imagine", () => ({
  generateDesignImagineAssets: vi.fn().mockResolvedValue([]),
  formatImagineAssetsForBuilder: vi.fn().mockReturnValue(""),
  injectImagineAssetsIntoHtml: vi.fn((html: string) => html),
}));

vi.mock("./claude-structured", () => ({
  runCompletion: vi.fn(),
  runStructured: vi.fn(),
}));

vi.mock("./gemini-brain", () => ({
  runGeminiTextCompletion: vi.fn(),
}));

vi.mock("./director-html-prototype", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./director-html-prototype")>();
  return {
    ...actual,
    packageDirectorHtmlPrototypePreview: vi.fn().mockResolvedValue({
      preview: {
        conceptId: "design-abc",
        title: "Acme Plumbing",
        rationale: "Wireline Design",
        kind: "stitch",
        previewDataUrl: "",
        htmlDownloadUrl: "/api/director/artifacts/signed",
        htmlArtifactId: "art-1",
        deviceType: "MOBILE",
      },
      artifacts: [{ id: "art-1", name: "design.html" }],
    }),
  };
});

import { runCompletion, runStructured } from "./claude-structured";
import { runGeminiTextCompletion } from "./gemini-brain";
import { runOpenRouterCompletion } from "./openrouter-structured";
import { DESIGN_KIT_BASE_CSS } from "./director-design-kit";

const polishedHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero"><h1 class="wl-headline">Acme</h1>
<a class="wl-btn wl-btn--primary" href="#">Book</a><span class="wl-badge">Licensed</span></header></body></html>`;

describe("runDirectorDesignStudio", () => {
  beforeEach(() => {
    vi.mocked(runOpenRouterCompletion).mockReset();
    vi.mocked(runCompletion).mockReset();
    vi.mocked(runStructured).mockReset();
    vi.mocked(runGeminiTextCompletion).mockReset();
  });

  const baseInput = {
    userId: "user-1",
    operatorMessage: "Design a landing page for emergency plumbing homeowners",
    designBriefMarkdown: "# Design brief\nAudience: homeowners",
    history: [],
    stitchOptions: { designMode: true as const },
  };

  it("runs research, multi-pass build, and packages preview", async () => {
    vi.mocked(runCompletion).mockResolvedValueOnce({
      text: "Research: trust badges, navy + cream, editorial hero.",
      usage: {},
    } as Awaited<ReturnType<typeof runCompletion>>);

    vi.mocked(runOpenRouterCompletion)
      .mockResolvedValueOnce(polishedHtml)
      .mockResolvedValueOnce(polishedHtml);

    vi.mocked(runGeminiTextCompletion)
      .mockResolvedValueOnce(polishedHtml)
      .mockResolvedValueOnce(polishedHtml);

    vi.mocked(runStructured)
      .mockResolvedValueOnce({
        decision: "revise",
        overall: 7,
        structure: 7,
        components: 7,
        visual_polish: 7,
        mobile: 7,
        accessibility: 7,
        issues: ["Tighten CTA padding"],
        revisionNotes: "Increase primary button size",
      })
      .mockResolvedValueOnce({
        decision: "approve",
        overall: 9,
        structure: 9,
        components: 9,
        visual_polish: 9,
        mobile: 9,
        accessibility: 9,
        issues: [],
      })
      .mockResolvedValueOnce({
        operatorReply: "Your **Acme Plumbing** page is ready.",
        pageTitle: "Acme Plumbing",
      });

    const turn = await runDirectorDesignStudio(baseInput);

    expect(runCompletion).toHaveBeenCalled();
    expect(runOpenRouterCompletion).toHaveBeenCalledTimes(2);
    expect(runGeminiTextCompletion).toHaveBeenCalledTimes(2);
    expect(turn.previews).toHaveLength(1);
    expect(turn.reply).toContain("Acme Plumbing");
    expect(turn.thinkingSummary).toContain("Pass 2");
  });
});
