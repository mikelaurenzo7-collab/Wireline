import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const exists = (path: string) => existsSync(resolve(root, path));

describe("repository and documentation organization", () => {
  it("separates canonical documentation from dated audit evidence", () => {
    const docs = read("docs/README.md");
    const audits = read("docs/AUDIT_INDEX.md");

    expect(docs).toContain("Canonical repository and system documents");
    expect(docs).toContain("Operating and release runbooks");
    expect(docs).toContain("Active strategy and planned work");
    expect(docs).toContain("[AUDIT_INDEX.md](./AUDIT_INDEX.md)");
    expect(audits).toContain("Historical evidence index");
    expect(audits).toContain("not current product doctrine");
  });

  it("indexes every docs file exactly once and validates all tracked Markdown links", () => {
    const checker = read("scripts/check-docs-index.mjs");

    expect(checker).toContain('const auditIndexPath = "docs/AUDIT_INDEX.md"');
    expect(checker).toContain("is linked from both documentation indexes");
    expect(checker).toContain("is not indexed");
    expect(checker).toContain('walkMarkdown("docs")');
    expect(checker).toContain("for (const sourcePath of trackedMarkdown)");
    expect(checker).toContain("links missing Markdown target");
    expect(checker).toContain("links outside the repository");
  });

  it("keeps only narrow tool and surface Markdown exceptions outside docs", () => {
    const docs = read("docs/README.md");
    const checker = read("scripts/check-docs-index.mjs");

    expect(docs).toContain("Repository-local Markdown exceptions");
    expect(docs).toContain("[AGENTS.md](../AGENTS.md)");
    expect(docs).toContain("[CLAUDE.md](../CLAUDE.md)");
    expect(docs).toContain("[apps/browser-extension/README.md](../apps/browser-extension/README.md)");
    expect(docs).toContain("[android/README.md](../android/README.md)");
    expect(docs).toContain("[ios/README.md](../ios/README.md)");
    expect(docs).not.toContain("SETUP_CHECKLIST.md");
    expect(docs).not.toContain("WIDGET_EXTENSION_PLAN.md");
    expect(docs).not.toContain("EVERYDAY_SHORTCUTS_PLAN.md");
    expect(checker).toContain('gitLines(["ls-files", "*.md", "**/*.md"])');
    expect(checker).toContain("canonicalLinks.has(file)");
    expect(checker).toContain('file.startsWith(".github/")');
    expect(checker).toContain("tracked Markdown without an approved home");
  });

  it("consolidates stale and duplicate runbooks instead of retaining pointer files", () => {
    const docs = read("docs/README.md");
    const android = read("android/README.md");
    const ios = read("ios/README.md");

    expect(exists("DATABASE_SETUP.md")).toBe(false);
    expect(exists("DEPLOY.md")).toBe(false);
    expect(exists("android/SETUP_CHECKLIST.md")).toBe(false);
    expect(exists("ios/SETUP_CHECKLIST.md")).toBe(false);
    expect(exists("ios/APP_STORE_CARPLAY_READINESS.md")).toBe(false);
    expect(exists("ios/EVERYDAY_SHORTCUTS_PLAN.md")).toBe(false);
    expect(exists("ios/WIDGET_EXTENSION_PLAN.md")).toBe(false);
    expect(exists("docs/IOS_APP_STORE_CARPLAY_READINESS.md")).toBe(true);
    expect(docs).toContain(
      "[IOS_APP_STORE_CARPLAY_READINESS.md](./IOS_APP_STORE_CARPLAY_READINESS.md)",
    );
    expect(android).toContain("## Release checklist");
    expect(ios).toContain("## Widgets");
    expect(ios).toContain("## Release checklist");
  });

  it("removes the shared-production db push shortcut", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const databaseRunbook = read("docs/DATABASE_OPERATIONS.md");

    expect(packageJson.scripts?.["db:push"]).toBeUndefined();
    expect(packageJson.scripts?.["db:migrate"]).toBe("drizzle-kit migrate");
    expect(databaseRunbook).toContain("Wireline intentionally exposes no `db:push` package script");
  });

  it("rejects tracked-ignore drift and case-colliding paths", () => {
    const checker = read("scripts/check-source-control-hygiene.mjs");
    const ignore = read(".gitignore");

    expect(checker).toContain('["ls-files", "-ci", "--exclude-standard"]');
    expect(checker).toContain("Case-insensitive path collisions");
    expect(checker).toContain("toLocaleLowerCase");
    expect(ignore).toContain("!.env.example");
  });

  it("documents one contribution and release workflow", () => {
    const contributing = read("CONTRIBUTING.md");

    expect(contributing).toContain("Start from the latest `main` commit");
    expect(contributing).toContain("Squash merge");
    expect(contributing).toContain("Migrations are append-only");
    expect(contributing).toContain("exact-head Vercel");
    expect(contributing).toContain("docs/AUDIT_INDEX.md");
  });

  it("runs repository and docs integrity checks in every Vercel build", () => {
    const build = read("scripts/vercel-build.mjs");

    expect(build).toContain('run("node", ["scripts/check-source-control-hygiene.mjs"])');
    expect(build).toContain('run("node", ["scripts/check-docs-index.mjs"])');
    expect(build).toContain('"tests/repo-documentation-organization-contract.test.ts"');
  });
});