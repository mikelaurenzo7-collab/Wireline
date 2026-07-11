import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public route loading contract", () => {
  it("keeps public navigation visible while lazy route chunks resolve", () => {
    const app = read("src/App.tsx");

    expect(app).toContain('import PrecisionPublicHeader from "./components/marketing/PrecisionPublicHeader"');
    expect(app).toContain("function isPublicMarketingPath");
    expect(app).toContain("<PrecisionPublicHeader />");
    expect(app).toContain('role="status"');
    expect(app).toContain("<span>Loading page</span>");
  });

  it("keeps the full transition surface for account and workspace entry", () => {
    const app = read("src/App.tsx");

    expect(app).toContain('if (isPublicMarketingPath(pathname))');
    expect(app).toContain('<TransitionSurface eyebrow="Wireline" title="Loading" busyLabel="Loading" />');
  });
});
