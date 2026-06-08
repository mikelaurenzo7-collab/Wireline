import { describe, expect, it } from "vitest";
import { DESIGN_KIT_BASE_CSS } from "./director-design-kit";
import { pickWinningArchitectCandidate, rankArchitectCandidates } from "./director-design-ensemble";

const strongHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero wl-hero--photo"><div class="wl-hero-bg"></div>
<div class="wl-hero-scrim"></div><div class="wl-hero-content"><h1 class="wl-headline">Summit Landscaping</h1>
<p class="wl-subhead">Licensed crews across Denver.</p><div class="wl-cta-row">
<a class="wl-btn wl-btn--primary" href="#">Get a quote</a></div></div></header>
<section class="wl-section"><div class="wl-trust-row"><span class="wl-badge">Insured</span></div></section></body></html>`;

const weakHtml = `<!doctype html><html><body><h1>Hi</h1><a href="#">Click</a></body></html>`;

describe("director-design-ensemble", () => {
  it("ranks polished kit HTML above wireframes", () => {
    const ranked = rankArchitectCandidates([
      { architectId: "hy3", label: "Hy3", html: weakHtml },
      { architectId: "kimi", label: "Kimi", html: strongHtml },
      { architectId: "step", label: "Step", html: weakHtml },
    ]);
    expect(ranked[0]?.architectId).toBe("kimi");
    expect(ranked[0]!.voteScore).toBeGreaterThan(ranked[1]!.voteScore);
  });

  it("pickWinningArchitectCandidate returns top scorer", () => {
    const ranked = rankArchitectCandidates([
      { architectId: "step", label: "Step", html: weakHtml },
      { architectId: "kimi", label: "Kimi", html: strongHtml },
    ]);
    const winner = pickWinningArchitectCandidate(ranked);
    expect(winner?.architectId).toBe("kimi");
  });
});
