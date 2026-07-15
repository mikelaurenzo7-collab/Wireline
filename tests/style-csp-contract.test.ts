import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildCSP, INLINE_STYLE_HASHES } from "../src/lib/csp";

describe("production style CSP", () => {
  it("allows the exact Radix dialog scroll-lock style without opening style-src-elem", () => {
    expect(INLINE_STYLE_HASHES).toContain("'sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo='");
    const policy = buildCSP(false);
    const styleElements = policy
      .split("; ")
      .find((directive) => directive.startsWith("style-src-elem "));
    expect(styleElements).toContain("sha256-nzTgYzXYDNe6BAHiiI7NNlfK8n/auuOAhh2t92YvuXo=");
    expect(styleElements).not.toContain("'unsafe-inline'");
  });

  it("pins the zero-gap layout invariant behind the exact dialog style hash", () => {
    const foundation = readFileSync("src/styles/foundation.css", "utf8");
    expect(foundation).toMatch(
      /html,\s*body,\s*#root,\s*\.wl-ui-caps\s*\{[^}]*overflow:\s*hidden;/s,
    );
    expect(foundation).toMatch(/body\s*\{[^}]*margin:\s*0;/s);
    expect(foundation).toMatch(
      /\.wl-ui-caps\s*>\s*:not\(\.wl-workspace-shell\)[^{]*\{[^}]*overflow:\s*auto;/s,
    );
  });
});
