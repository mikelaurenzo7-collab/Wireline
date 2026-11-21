import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "../src/components/studio/StudioContextChrome.tsx"),
  "utf8",
);

describe("Studio context chrome", () => {
  it("keeps narrow mobile headers on one row with a visible Set Up action and no browser control", () => {
    expect(source).toContain("flex min-h-[56px] flex-nowrap");
    expect(source).toContain('className="flex shrink-0 flex-nowrap items-center gap-1"');
    expect(source).not.toContain('id="studio-panel-toggle"');
    expect(source).toContain('aria-label="Set Up Bot"');
    expect(source).toContain("<span>Set Up</span>");
  });
});
