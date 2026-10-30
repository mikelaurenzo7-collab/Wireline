import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "../src/components/studio/StudioContextChrome.tsx"),
  "utf8",
);

describe("Studio context chrome", () => {
  it("keeps narrow mobile headers on one row without duplicating the Browser tab", () => {
    expect(source).toContain("flex min-h-[56px] flex-nowrap");
    expect(source).toContain('className="flex shrink-0 flex-nowrap items-center gap-1"');
    expect(source).toContain('className="hidden min-h-[44px] px-2.5 sm:inline-flex"');
    expect(source).toContain('<span className="hidden sm:inline">Set Up</span>');
  });
});
