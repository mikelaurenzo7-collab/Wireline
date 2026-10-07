import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { markLongCopy } from "../src/lib/long-copy-wrap";

type FakeElement = {
  dataset: Record<string, string | undefined>;
  height: number;
  getBoundingClientRect: () => { height: number };
};

function element(lines: number, lineHeight = 20, padding = 16): FakeElement {
  const fake: FakeElement = {
    dataset: {},
    height: lines * lineHeight + padding * 2,
    getBoundingClientRect: () => ({ height: fake.height }),
  };
  return fake;
}

describe("long copy wrap", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("marks only blocks taller than six lines, net of padding, and unmarks on reflow", () => {
    vi.stubGlobal("getComputedStyle", () => ({
      lineHeight: "20px",
      paddingTop: "16px",
      paddingBottom: "16px",
    }));
    const short = element(2);
    const six = element(6);
    const long = element(8);
    const root = { querySelectorAll: () => [short, six, long] } as unknown as ParentNode;

    expect(markLongCopy(root)).toBe(1);
    expect(long.dataset.wlLongCopy).toBe("true");
    expect(short.dataset.wlLongCopy).toBeUndefined();
    expect(six.dataset.wlLongCopy).toBeUndefined();

    // A wider viewport re-flows the long block into four lines: balance again.
    long.height = 4 * 20 + 32;
    markLongCopy(root);
    expect(long.dataset.wlLongCopy).toBeUndefined();
  });

  it("is installed at startup and switches marked blocks to pretty wrapping", () => {
    expect(readFileSync("src/main.tsx", "utf8")).toContain("installLongCopyWrap();");
    const css = readFileSync("src/styles/botbound-master-polish.css", "utf8");
    expect(css).toMatch(/:where\(p, li, label, dt, dd, figcaption, blockquote, td, th\)/);
    expect(css).toMatch(/\[data-wl-long-copy="true"\] \{\s*text-wrap: pretty;/);
  });
});
