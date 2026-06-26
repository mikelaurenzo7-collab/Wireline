import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const retiredProductTerms = [
  "Ametrine Precision",
  "Browser Companion",
  "personal AI call assistant",
];

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function expectNoTerms(source: string, terms: string[]) {
  const lower = source.toLowerCase();
  for (const term of terms) {
    expect(lower).not.toContain(term.toLowerCase());
  }
}

describe("Wireline product documentation contract", () => {
  it("keeps the root README aligned with the current product model", () => {
    const readme = read("README.md");
    expect(readme).toContain("Wireline Command");
    expect(readme).toContain("Wireline Mono design system");
    expect(readme).toContain("Create -> Train -> Run");
    expectNoTerms(readme, retiredProductTerms);
  });

  it("keeps the docs index aligned with current product truth", () => {
    const readme = read("docs/README.md");
    expect(readme).toContain("Create -> Train -> Run");
    expect(readme).toContain("Agents");
    expect(readme).toContain("Training");
    expect(readme).toContain("Wireline Command");
    expectNoTerms(readme, retiredProductTerms);
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
    }
  });

  it("keeps static metadata and OG positioning aligned with the current product truth", () => {
    const head = read("index.html");
    const ogImage = read("public/og-image.svg");

    expect(head).toContain("Wireline - Agents for calls, texts, and follow-up");
    expect(head).toContain(
      "create, train, and run agents for calls, texts, follow-up, browser context, email, and integrations",
    );
    expect(ogImage).toContain("Agents for calls, texts, and follow-up.");
    expect(ogImage).toContain("Create. Train. Run.");
    expectNoTerms(head, retiredProductTerms);
    expectNoTerms(ogImage, retiredProductTerms);
  });
});
