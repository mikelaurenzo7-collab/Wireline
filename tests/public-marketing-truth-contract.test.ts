import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public marketing truth contract", () => {
  it("does not publish synthetic adoption or usage counts", () => {
    const routes = read("src/routes/marketing-runtime-routes.ts");

    expect(routes).not.toContain("agents_online: 120");
    expect(routes).not.toContain("calls_this_month: 8400");
    expect(routes).not.toContain("tenants: 95");
    expect(routes).not.toContain('source: "static_example"');
    expect(routes).toContain('code: "public_metrics_unavailable"');
    expect(routes).toContain('source: "not_published"');
    expect(routes).toContain('res.setHeader("Cache-Control", "no-store")');
  });

  it("keeps the launch authority explicit about evidence-backed proof", () => {
    const launch = read("docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md");
    expect(launch).toContain("BotBound does not need fake social proof");
    expect(launch).toContain("Never manufacture customer logos, quotes, usage counts");
  });
});
