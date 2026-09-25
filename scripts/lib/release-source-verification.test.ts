import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error -- plain .mjs helper shared by release scripts.
import {
  assertCleanCheckout,
  normalizeBaseURL,
  resolveSourceCommit,
  verifyRemoteSourceCommit,
  waitForRemoteSourceCommit,
} from "./release-source-verification.mjs";

describe("launch media source verification", () => {
  let repoRoot = "";

  beforeEach(async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("GITHUB_SHA", "");
    repoRoot = await mkdtemp(join(tmpdir(), "botbound-release-source-"));
    execFileSync("git", ["init", "--quiet"], { cwd: repoRoot });
    execFileSync("git", ["config", "user.email", "launch-test@botbound.test"], {
      cwd: repoRoot,
    });
    execFileSync("git", ["config", "user.name", "BotBound Launch Test"], { cwd: repoRoot });
    await writeFile(join(repoRoot, "source.txt"), "certified source\n");
    execFileSync("git", ["add", "source.txt"], { cwd: repoRoot });
    execFileSync("git", ["commit", "--quiet", "-m", "certified source"], { cwd: repoRoot });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("binds certification to one clean local commit", async () => {
    const sourceCommit = resolveSourceCommit(repoRoot);
    expect(sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(() => assertCleanCheckout(repoRoot, sourceCommit)).not.toThrow();

    await writeFile(join(repoRoot, "source.txt"), "dirty source\n");
    expect(() => assertCleanCheckout(repoRoot, sourceCommit)).toThrow("clean Git checkout");
  });

  it("rejects a malformed CI source commit instead of silently using HEAD", () => {
    vi.stubEnv("GITHUB_SHA", "not-a-commit");
    expect(() => resolveSourceCommit(repoRoot)).toThrow("exact 40-character SHA");
  });

  it("accepts only the exact canonical production origin", () => {
    expect(normalizeBaseURL("https://botbound.app/")).toBe("https://botbound.app");
    for (const target of [
      "http://botbound.app",
      "https://trywireline.com",
      "https://preview.botbound.app",
      "https://user:pass@botbound.app",
    ]) {
      expect(() => normalizeBaseURL(target), target).toThrow();
    }
  });

  it("checks a cache-busted health response for the exact deployed commit", async () => {
    const sourceCommit = resolveSourceCommit(repoRoot);
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/api/health/public");
      expect(url.searchParams.get("source_commit_check")).toBe(sourceCommit);
      expect(init?.method).toBe("HEAD");
      expect(init?.redirect).toBe("error");
      return new Response(null, {
        status: 200,
        headers: { "X-Wireline-Source-Commit": sourceCommit },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyRemoteSourceCommit(sourceCommit, "https://botbound.app"),
    ).resolves.toMatchObject({ baseURL: "https://botbound.app", deployedCommit: sourceCommit });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("waits through a stale production alias until the checkout commit is live", async () => {
    const sourceCommit = resolveSourceCommit(repoRoot);
    const staleCommit = "f".repeat(40);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { "X-Wireline-Source-Commit": staleCommit },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { "X-Wireline-Source-Commit": sourceCommit },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      waitForRemoteSourceCommit(sourceCommit, "https://botbound.app", {
        timeoutMs: 100,
        pollIntervalMs: 0,
      }),
    ).resolves.toMatchObject({ deployedCommit: sourceCommit });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
