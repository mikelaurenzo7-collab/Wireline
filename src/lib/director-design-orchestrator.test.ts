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

const polishedHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
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

  it("runs research, build pipeline, and packages preview", async () => {
    vi.mocked(runOpenRouterCompletion).mockImplementation(async ({ user }) => {
      if (user.includes("layout scout") || user.includes("Layout scout")) {
        return "Archetype A: asymmetric hero";
      }
      if (user.includes("Research")) return "Research: trust, navy + cream.";
      if (user.includes("critique") || user.includes("Critique")) {
        return "## Must fix\n- Increase CTA contrast";
      }
      return polishedHtml;
    });

    vi.mocked(runStructured).mockResolvedValue({
      operatorReply: "Your **Summit Landscaping** page is ready.",
      pageTitle: "Summit Landscaping",
    });

    const turn = await runDirectorDesignStudio(baseInput);

    expect(runOpenRouterCompletion).toHaveBeenCalled();
    expect(turn.previews).toHaveLength(1);
    expect(turn.reply).toContain("Summit Landscaping");
    expect(turn.thinkingSummary).toMatch(/build/i);
  });

  it("pass 1 runs layout scout, critic, and finisher without a localize pass", async () => {
    vi.mocked(runOpenRouterCompletion).mockImplementation(async ({ user, system }) => {
      if (system?.includes("layout scout") || user.includes("Layout scout")) {
        return "Archetype A: asymmetric hero";
      }
      if (user.includes("Research") || system?.includes("research")) {
        return "Research: trust, navy + cream.";
      }
      if (user.includes("critique") || user.includes("Critique")) {
        return "## Must fix\n- Increase CTA contrast";
      }
      return polishedHtml;
    });

    vi.mocked(runStructured).mockResolvedValue({
      operatorReply: "Your **Summit Landscaping** page is ready.",
      pageTitle: "Summit Landscaping",
    });

    await runDirectorDesignStudio(baseInput);

    const users = vi.mocked(runOpenRouterCompletion).mock.calls.map((c) => c[0].user);
    const systems = vi.mocked(runOpenRouterCompletion).mock.calls.map((c) => c[0].system ?? "");

    expect(systems.some((s) => /layout scout/i.test(s))).toBe(true);
    expect(users.some((u) => /critique/i.test(u))).toBe(true);
    expect(users.some((u) => /localize/i.test(u))).toBe(false);
    expect(runStructured).toHaveBeenCalled();
  });
});
