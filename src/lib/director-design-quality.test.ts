import { describe, expect, it } from "vitest";
import { DESIGN_KIT_BASE_CSS } from "./director-design-kit";
import {
  assessDesignStudioHtmlQuality,
  designQualityPasses,
  designQualityPassesFastLane,
  isPolishedDesignHtml,
} from "./director-design-quality";

describe("director design quality", () => {
  it("rejects wireframe HTML and accepts polished embedded CSS", () => {
    const wireframe = Buffer.from(
      "<!DOCTYPE html><html><body>" +
        "<a href='/pricing'>Pricing</a><a href='/blog'>Blog</a><a href='/login'>Login</a>" +
        "</body></html>",
    );
    const polishedHtml = Buffer.from(
      "<!DOCTYPE html><html><head><style>body{font-family:sans-serif;color:#111;background:#f5f0e8}" +
        "a{color:inherit;text-decoration:none}main{padding:2rem}</style></head><body><main>" +
        "Ready for preview with enough bytes and real embedded styling for the client UI. ".repeat(
          80,
        ) +
        "</main></body></html>",
    );

    expect(isPolishedDesignHtml(wireframe)).toBe(false);
    expect(isPolishedDesignHtml(polishedHtml)).toBe(true);
  });

  it("fast lane gate is lighter than full production gate", () => {
    const previewHtml = `<!doctype html><html><head><style>${DESIGN_KIT_BASE_CSS}</style></head>
<body class="wl-page"><header class="wl-hero"><h1 class="wl-headline">Acme HVAC</h1>
<p class="wl-subhead">Licensed crews across Denver metro.</p>
<a class="wl-btn wl-btn--primary" href="#">Call now</a></header>
<section class="wl-section"><span class="wl-badge">Insured</span></section>
<!-- ${"preview padding ".repeat(120)} --></body></html>`;

    const report = assessDesignStudioHtmlQuality(previewHtml);
    expect(designQualityPassesFastLane(report)).toBe(true);
    if (!report.usesDesignKit) {
      expect(designQualityPasses(report)).toBe(false);
    }
  });
});
