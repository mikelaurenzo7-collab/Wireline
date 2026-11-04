import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCSP, INLINE_SCRIPT_HASHES } from "../src/lib/csp";

describe("first-paint inline scripts and strict CSP", () => {
  it("reserves first-visit mobile consent space in the head-loaded shell, before React", () => {
    const index = readFileSync("index.html", "utf8");
    const shell = readFileSync("public/app-shell.css", "utf8");
    const appStyle = readFileSync("src/styles/letterpress-polish.css", "utf8");
    expect(index).toContain('<link rel="stylesheet" href="/app-shell.css" />');
    expect(shell).toContain('html[data-wl-privacy-prepaint="pending"] .wl-mobile-privacy-host:empty');
    expect(shell).toContain("min-height: calc(4.125rem + env(safe-area-inset-top, 0px) + 5.75rem)");
    expect(appStyle).not.toContain('html[data-wl-privacy-prepaint="pending"] .wl-mobile-privacy-host:empty');
  });

  it("hash-allowlists every executable inline script in the actual HTML shell", () => {
    const html = readFileSync("index.html", "utf8");
    const executable = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter(([, attributes, body]) => {
        const external = /\bsrc\s*=/.test(attributes);
        const dataOnly = /\btype\s*=\s*["']application\/ld\+json["']/.test(attributes);
        return !external && !dataOnly && Boolean(body.trim());
      })
      .map(([, , body]) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);

    expect(executable).toHaveLength(3);
    expect(new Set(INLINE_SCRIPT_HASHES)).toEqual(new Set(executable));
    const production = buildCSP(false);
    for (const hash of executable) expect(production).toContain(hash);
    const scriptSrc = production.split("; ").find((part) => part.startsWith("script-src "));
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });
});
