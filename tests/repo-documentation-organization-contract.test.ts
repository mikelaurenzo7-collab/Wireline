import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

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

  it("requires every docs markdown file to be indexed exactly once with valid targets", () => {
    const checker = read("scripts/check-docs-index.mjs");

    expect(checker).toContain('const auditIndexPath = "docs/AUDIT_INDEX.md"');
    expect(checker).toContain("Indexed Markdown target does not exist");
    expect(checker).toContain("is linked from both documentation indexes");
    expect(checker).toContain("is not indexed");
    expect(checker).toContain('walkMarkdown("docs")');
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