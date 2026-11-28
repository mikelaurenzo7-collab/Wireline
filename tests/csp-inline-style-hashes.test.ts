import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { INLINE_STYLE_HASHES, buildCSP } from "../src/lib/csp";

const require = createRequire(import.meta.url);

/**
 * Two of the pop-up parts each render one fixed <style> to hide a native
 * scrollbar: the scroll area (the command palette's list) and the select (its
 * option list). The policy allows an inline style by hash only. Without the
 * hash the browser refuses the style and a second scrollbar shows, which
 * production did on 2026-11-27.
 *
 * The hashes are recomputed from the installed packages, so an upgrade that
 * changes either rule fails here instead of in a customer's console.
 */
function inlineStyleRules(packageName: string): string[] {
  const source = readFileSync(join(dirname(require.resolve(packageName)), "index.mjs"), "utf8");
  const rules: string[] = [];
  for (const match of source.matchAll(/__html:\s*`([^`$]*)`/g)) rules.push(match[1]);
  for (const match of source.matchAll(/__html:\s*("(?:[^"\\]|\\.)*")/g)) {
    rules.push(JSON.parse(match[1]) as string);
  }
  return rules;
}

const hashOf = (rule: string) =>
  `'sha256-${createHash("sha256").update(rule, "utf8").digest("base64")}'`;

describe("inline styles the pop-up parts render", () => {
  it.each([
    ["@radix-ui/react-scroll-area", "[data-radix-scroll-area-viewport]"],
    ["@radix-ui/react-select", "[data-radix-select-viewport]"],
  ])("%s: its one fixed rule is allowed by hash", (packageName, selector) => {
    const rules = inlineStyleRules(packageName);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toContain(selector);
    expect(INLINE_STYLE_HASHES).toContain(hashOf(rules[0]));
  });

  it("keeps the policy to hashes: no blanket allowance for inline style elements", () => {
    const policy = buildCSP(false);
    const styleElements = policy.split("; ").find((part) => part.startsWith("style-src-elem "));
    expect(styleElements).toBeDefined();
    expect(styleElements).not.toContain("'unsafe-inline'");
    for (const hash of INLINE_STYLE_HASHES) expect(styleElements).toContain(hash);
  });
});
