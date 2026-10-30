import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_PRODUCTION_URL,
  canonicalRuntimeCommitFinding,
  resolveCanonicalProductionUrl,
} from "../scripts/lib/production-url.mjs";

// T1 (Oct 30, 2026): the Vercel promotion tests that lived here were retired
// with the Vercel build/deploy surface. What remains is provider-independent:
// schema promotion safety and canonical-origin certification.
describe("production promotion safety", () => {
  it("refuses to promote uncommitted schema under an otherwise valid release SHA", () => {
    const tempRepository = mkdtempSync(join(tmpdir(), "botbound-schema-promotion-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: tempRepository, stdio: "ignore" });
      writeFileSync(join(tempRepository, "tracked.txt"), "reviewed\n", "utf8");
      execFileSync("git", ["add", "tracked.txt"], { cwd: tempRepository, stdio: "ignore" });
      execFileSync(
        "git",
        [
          "-c",
          "user.name=BotBound Test",
          "-c",
          "user.email=botbound-test@example.invalid",
          "commit",
          "--quiet",
          "-m",
          "reviewed release",
        ],
        { cwd: tempRepository, stdio: "ignore" },
      );
      const releaseSha = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: tempRepository,
        encoding: "utf8",
      }).trim();
      writeFileSync(join(tempRepository, "uncommitted-migration.sql"), "select 1;\n", "utf8");

      const result = spawnSync(
        process.execPath,
        [resolve(process.cwd(), "scripts/promote-production-schema.mjs")],
        {
          cwd: tempRepository,
          env: {
            ...process.env,
            BOTBOUND_PRODUCTION_SCHEMA_CONFIRM: "APPLY_APPEND_ONLY_BOTBOUND_MIGRATIONS",
            BOTBOUND_RELEASE_SHA: releaseSha,
            POSTGRES_URL: "postgres://user:pass@localhost:5432/db",
            DATABASE_URL: "postgres://user:pass@localhost:5432/db",
          },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Local release checkout is not clean");
      expect(result.stderr).not.toContain("POSTGRES_URL or DATABASE_URL is required");
    } finally {
      rmSync(tempRepository, { recursive: true, force: true });
    }
  }, 15_000);

  it("probes readiness only on the canonical customer-facing origin", () => {
    expect(resolveCanonicalProductionUrl("")).toBe(CANONICAL_PRODUCTION_URL);
    expect(resolveCanonicalProductionUrl("https://botbound.app/")).toBe(CANONICAL_PRODUCTION_URL);
    expect(() => resolveCanonicalProductionUrl("https://healthy-copy.example.com")).toThrow(
      /noncanonical production origin/,
    );
    expect(() => resolveCanonicalProductionUrl("https://botbound.app/alternate")).toThrow(
      /noncanonical production origin/,
    );
    expect(() => resolveCanonicalProductionUrl("https://trywireline.com/")).toThrow(
      /noncanonical production origin/,
    );
  });

  it("fails an alias split-brain even when another deployment is healthy", () => {
    expect(
      canonicalRuntimeCommitFinding({ ok: true, sourceCommit: "a".repeat(40) }, "a".repeat(40)),
    ).toBeNull();
    expect(
      canonicalRuntimeCommitFinding({ ok: true, sourceCommit: "b".repeat(40) }, "a".repeat(40)),
    ).toBe("canonical_domain_commit_mismatch");
    expect(canonicalRuntimeCommitFinding({ ok: false }, "a".repeat(40))).toBe(
      "canonical_runtime_unreachable",
    );
  });
});
