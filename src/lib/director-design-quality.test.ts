import { describe, expect, it } from "vitest";
import { DESIGN_KIT_BASE_CSS } from "./director-design-kit";
import { assessDesignStudioHtmlQuality, designQualityPasses } from "./director-design-quality";

const polishedKitHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero">
<h1 class="wl-headline">Brightline Home Services</h1>
<p class="wl-subhead">Same-day HVAC and plumbing across Atlanta.</p>
<div class="wl-cta-row"><a class="wl-btn wl-btn--primary" href="#">Schedule Service</a></div>
<div class="wl-trust-row"><span class="wl-badge">Licensed</span><span class="wl-badge">Insured</span></div>
</header></body></html>`;

describe("assessDesignStudioHtmlQuality", () => {
  it("accepts kit-based polished HTML", () => {
    const report = assessDesignStudioHtmlQuality(polishedKitHtml.repeat(2));
    expect(report.polished).toBe(true);
    expect(report.usesDesignKit).toBe(true);
    expect(designQualityPasses(report)).toBe(true);
  });

  it("rejects bare wireframe HTML", () => {
    const wireframe =
      "<!doctype html><html><body><a href='/'>Home</a><a href='/about'>About</a></body></html>";
    const report = assessDesignStudioHtmlQuality(wireframe);
    expect(report.polished).toBe(false);
    expect(designQualityPasses(report)).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });
});
