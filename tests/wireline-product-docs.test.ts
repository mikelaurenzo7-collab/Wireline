import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const retiredProductLanguage = /Ametrine Precision|Browser Companion|browser companion/i;
const retiredPalette = /#5D3FD3|#451EBB|#F8F9FF|#EFF4FF|#E5EEFF|#0B1C30/i;

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

describe("Wireline product documentation contract", () => {
  it("keeps the root README aligned with the current product model", () => {
    const readme = read("README.md");
    expect(readme).toContain("Wireline Command");
    expect(readme).toContain("Wireline Mono design system");
    expect(readme).toContain("Create → Train → Run");
    expect(readme).not.toMatch(retiredProductLanguage);
  });

  it("keeps extension docs positioned as Wireline Command", () => {
    const readme = read("apps/browser-extension/README.md");
    expect(readme).toContain("# Wireline Command");
    expect(readme).toContain("Prepare a call");
    expect(readme).toContain("Draft a text");
    expect(readme).toContain("Send an agent task");
  });

  it("keeps native docs on the Wireline Mono contract", () => {
    const android = read("android/README.md");
    const ios = read("ios/README.md");

    for (const source of [android, ios]) {
      expect(source).toContain("Agents that answer");
      expect(source).toContain("Wireline Mono");
      expect(source).not.toMatch(retiredPalette);
    }
  });
});
