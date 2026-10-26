import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { deindexFallbackDocument } from "../src/server/not-found-document";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function expectDeindexed(shell: string) {
  expect(shell).toContain('<meta name="robots" content="noindex, nofollow" />');
  expect(shell).toContain('<meta name="googlebot" content="noindex, nofollow" />');
  expect(shell).not.toContain('rel="canonical"');
  expect(shell).not.toContain('property="og:url"');
  expect(shell).not.toContain("index, follow");
}

describe("unknown route document head", () => {
  it("emits noindex and drops the homepage canonical on a 404 shell", () => {
    expectDeindexed(deindexFallbackDocument(read("index.html")));
  });

  it("matches a production homepage shell when the build output is present", () => {
    const built = ["dist/index.html", "dist/client/index.html"].filter((path) =>
      existsSync(resolve(process.cwd(), path)),
    );
    for (const path of built) expectDeindexed(deindexFallbackDocument(read(path)));
  });

  it("rewrites the production 404 response and redirects the retired aliases", () => {
    const server = read("server.ts");
    const app = read("src/App.tsx");
    const notFound = read("src/pages/PublicNotFound.tsx");
    expect(server).toContain('deindexFallbackDocument(readFileSync(shellPath, "utf8"))');
    expect(server).toContain("registerLegacyContentRedirects(app)");
    expect(server).toContain("prerenderedShells.get(normalizedPath) ?? indexHtml");
    expect(read("src/server/register-production-static-aliases.ts")).toContain(
      '["/legal", "/terms"]',
    );
    expect(read("src/server/register-production-static-aliases.ts")).toContain(
      '["/docs", "/developers"]',
    );
    expect(read("src/server/register-production-static-aliases.ts")).toContain("res.redirect(301,");
    expect(app).toContain('path="/legal" element={<PreservingRedirect to="/terms" />}');
    expect(app).toContain('path="/docs" element={<PreservingRedirect to="/developers" />}');
    expect(notFound).not.toContain('path="/404"');
    expect(notFound).toContain("noIndex");
  });
});
