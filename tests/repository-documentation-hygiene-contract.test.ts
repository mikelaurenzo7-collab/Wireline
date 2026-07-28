import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const databaseGuide = read("DATABASE_SETUP.md");
const deployGuide = read("DEPLOY.md");
const docsIndex = read("docs/README.md");
const docsCheck = read("scripts/check-docs-index.mjs");

describe("repository documentation hygiene", () => {
  it("documents the actual Wireline database role and forbids shared-environment push workflows", () => {
    expect(databaseGuide).toContain("`wireline_server`");
    expect(databaseGuide).toContain("`app.current_user_id`");
    expect(databaseGuide).toContain("never use `db:push`");
    expect(databaseGuide).not.toContain("SET LOCAL ROLE authenticated");
    expect(databaseGuide).not.toContain("auth.uid()");
    expect(databaseGuide).not.toContain("Push any pending migrations");
  });

  it("keeps live contact data out of the deployment guide and points to code-owned inventories", () => {
    expect(deployGuide).toContain("`src/data/contact-agents.ts`");
    expect(deployGuide).toContain("Only `revaluate/wireline` may be linked");
    expect(deployGuide).not.toContain("OWNER_EMAIL=mikelaurenzo7@gmail.com");
    expect(deployGuide).not.toMatch(/\(\d{3}\)\s+\d{3}-\d{4}/);
  });

  it("separates canonical guidance from runbooks, evidence, plans, and historical material", () => {
    for (const section of [
      "## Canonical contracts",
      "## Operating runbooks and current decisions",
      "## Audit evidence and historical snapshots",
      "## Planned work",
      "## Historical / superseded material",
    ]) {
      expect(docsIndex).toContain(section);
    }
    expect(docsIndex).toContain("evidence, not standalone current policy");
  });

  it("requires every docs Markdown file to be indexed exactly once", () => {
    expect(docsCheck).toContain('walk("docs")');
    expect(docsCheck).toContain("is not indexed");
    expect(docsCheck).toContain("link it exactly once");
    expect(docsCheck).toContain("duplicate link");
  });
});
