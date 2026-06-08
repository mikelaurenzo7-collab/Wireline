import { describe, expect, it, vi } from "vitest";
import { DESIGN_KIT_BASE_CSS } from "./director-design-kit";
import { JURY_TIEBREAK_SCORE_GAP, resolveArchitectJury } from "./director-design-jury";

vi.mock("./openrouter-structured", () => ({
  isOpenRouterConfigured: vi.fn().mockReturnValue(true),
  runOpenRouterStructured: vi.fn(),
}));

import { runOpenRouterStructured } from "./openrouter-structured";

const strongHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero wl-hero--photo"><h1 class="wl-headline">Acme</h1>
<a class="wl-btn wl-btn--primary" href="#">Book</a><span class="wl-badge">Licensed</span></header></body></html>`;

const weakHtml = `<!doctype html><html><body><h1>Hi</h1><a href="#">Click</a></body></html>`;

describe("resolveArchitectJury", () => {
  it("picks clear deterministic winner without GLM when gap is large", async () => {
    const verdict = await resolveArchitectJury({
      entries: [
        { architectId: "hy3", label: "Hy3", html: weakHtml },
        { architectId: "kimi", label: "Kimi", html: strongHtml },
      ],
      operatorMessage: "Landscaping homepage",
      designBriefMarkdown: "# Brief",
      passNumber: 1,
      glmCriticModelId: "z-ai/glm-5v-turbo",
    });

    expect(verdict.winner.architectId).toBe("kimi");
    expect(verdict.usedGlmTiebreak).toBe(false);
    expect(runOpenRouterStructured).not.toHaveBeenCalled();
  });

  it("calls GLM tie-break when top two scores are within gap", async () => {
    vi.mocked(runOpenRouterStructured).mockResolvedValueOnce({
      result: { winnerId: "step", reasoning: "Stronger CTA hierarchy" },
    });

    const midHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero"><h1 class="wl-headline">Acme</h1>
<a class="wl-btn wl-btn--primary" href="#">Book</a></header></body></html>`;

    const nearHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero"><h1 class="wl-headline">Acme Pro</h1>
<a class="wl-btn wl-btn--primary" href="#">Call</a></header></body></html>`;

    const verdict = await resolveArchitectJury({
      entries: [
        { architectId: "kimi", label: "Kimi", html: midHtml },
        { architectId: "step", label: "Step", html: nearHtml },
      ],
      operatorMessage: "Landscaping homepage",
      designBriefMarkdown: "# Brief",
      passNumber: 1,
      glmCriticModelId: "z-ai/glm-5v-turbo",
    });

    const gap = Math.abs(verdict.ranked[0]!.voteScore - verdict.ranked[1]!.voteScore);
    if (gap < JURY_TIEBREAK_SCORE_GAP) {
      expect(verdict.usedGlmTiebreak).toBe(true);
      expect(runOpenRouterStructured).toHaveBeenCalled();
    }
  });
});
