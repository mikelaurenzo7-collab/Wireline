import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("screenshot-led minimal rhythm contract", () => {
  const rhythm = read("src/styles/visual-qa-minimal-rhythm.css");
  const productBundle = read("src/styles/wireline-product-surfaces.css");
  const marketingBundle = read("src/styles/wireline-marketing-surfaces.css");

  it("loads the pass on both public and authenticated surfaces", () => {
    expect(productBundle).toContain('@import "./visual-qa-minimal-rhythm.css";');
    expect(marketingBundle).toContain('@import "./visual-qa-minimal-rhythm.css";');
    expect(marketingBundle.indexOf("visual-qa-minimal-rhythm.css")).toBeGreaterThan(
      marketingBundle.indexOf("public-marketing-polish.css"),
    );
  });

  it("keeps primary display titles uppercase without transforming body copy", () => {
    expect(rhythm).toContain(".marketing-hero__title");
    expect(rhythm).toContain(".wl-workspace-page :where(h1, h2)");
    expect(rhythm).toContain("#create-agent-title");
    expect(rhythm).toContain("text-transform: uppercase");
    expect(rhythm).not.toContain(".marketing-surface p {");
    expect(rhythm).not.toContain(".wl-workspace-page p {");
  });

  it("removes only redundant Fast Start introductions", () => {
    expect(rhythm).toContain('form[aria-labelledby="create-agent-title"]');
    expect(rhythm).toContain("#create-agent-description");
    expect(rhythm).toContain("> .min-h-0 > h3 + p");
  });

  it("keeps mobile descriptions concise while preserving operational controls", () => {
    expect(rhythm).toContain("@media (max-width: 639px)");
    expect(rhythm).toContain("#company-identity-title + p");
    expect(rhythm).toContain('[aria-label="Calling setup steps"]');
    expect(rhythm).toContain('nav[aria-label="Workspace navigation"]');
    expect(rhythm).not.toContain("button {\n    display: none");
  });
});
