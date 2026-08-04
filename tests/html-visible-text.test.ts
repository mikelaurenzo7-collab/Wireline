import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { htmlToVisibleText } from "../src/lib/safe-public-text-fetch";

const scannerSource = readFileSync(
  new URL("../src/lib/html-visible-text.ts", import.meta.url),
  "utf8",
);

describe("HTML visible-text scanner", () => {
  it("preserves separation across minified adjacent inline and block tags", () => {
    const parsed = htmlToVisibleText(
      "<main><span>Alpha</span><span>Beta</span><p>Gamma</p><p>Delta</p></main>",
    );
    expect(parsed.text).toContain("Alpha Beta");
    expect(parsed.text).toContain("Gamma");
    expect(parsed.text).toContain("Delta");
    expect(parsed.text).not.toContain("AlphaBeta");
  });

  it("keeps nested non-content containers suppressed until their real close", () => {
    const parsed = htmlToVisibleText(`
      <template>
        Outer template.
        <div>Nested wrapper.<template>Inner template.</template>Outer tail.</div>
      </template>
      <svg><text>SVG label.</text><svg><text>Nested SVG label.</text></svg></svg>
      <p>Visible business fact.</p>
    `);
    expect(parsed.text).toBe("Visible business fact.");
  });

  it("does not treat invalid lookalike style values as hidden", () => {
    const parsed = htmlToVisibleText(`
      <p style="display:none-block">Visible invalid display value.</p>
      <p style="visibility:hidden-ish">Visible invalid visibility value.</p>
      <p style="display:none!important">Actually hidden display.</p>
      <p style="visibility:hidden !important; color:red">Actually hidden visibility.</p>
    `);
    expect(parsed.text).toContain("Visible invalid display value.");
    expect(parsed.text).toContain("Visible invalid visibility value.");
    expect(parsed.text).not.toContain("Actually hidden display");
    expect(parsed.text).not.toContain("Actually hidden visibility");
  });

  it("handles quoted greater-than signs without truncating attributes", () => {
    const parsed = htmlToVisibleText(`
      <div title="2 > 1" aria-label='A > B'>Visible after quoted delimiters.</div>
      <div hidden title="3 > 2">Hidden after quoted delimiters.</div>
    `);
    expect(parsed.text).toContain("Visible after quoted delimiters.");
    expect(parsed.text).not.toContain("Hidden after quoted delimiters.");
  });

  it("keeps closure work incremental instead of rescanning the full stack", () => {
    expect(scannerSource).toContain("hiddenRemoved");
    expect(scannerSource).not.toContain("stack.reduce");
  });
});
