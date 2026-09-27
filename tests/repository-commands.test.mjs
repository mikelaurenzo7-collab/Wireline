import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const fixtures = [];
const prefix = "botbound repo commands-";

function fixture(script) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  fixtures.push(root);
  const repo = join(root, "checkout with spaces");
  const caller = join(root, "other directory");
  mkdirSync(join(repo, "scripts"), { recursive: true });
  mkdirSync(join(caller, "dist"), { recursive: true });
  const entry = join(repo, "scripts", script);
  copyFileSync(fileURLToPath(new URL(`../scripts/${script}`, import.meta.url)), entry);
  return { repo, caller, entry };
}

afterEach(() => {
  for (const root of fixtures.splice(0)) {
    // Fixture cleanup may remove only directories created under our temp prefix.
    if (!resolve(root).startsWith(`${resolve(tmpdir())}${sep}${prefix}`)) {
      throw new Error("Refusing to remove an unexpected fixture path");
    }
    rmSync(root, { recursive: true, force: true });
  }
});

describe("portable repository commands", () => {
  it("cleans only its checkout dist, from another cwd, and tolerates missing output", () => {
    const { repo, caller, entry } = fixture("clean-build.mjs");
    mkdirSync(join(repo, "dist"));
    writeFileSync(join(repo, "dist", "bundle.js"), "generated");
    writeFileSync(join(repo, "source.txt"), "source");
    writeFileSync(join(caller, "dist", "keep.txt"), "unrelated");

    for (let run = 0; run < 2; run++) {
      const result = spawnSync(process.execPath, [entry], { cwd: caller, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(join(repo, "dist"))).toBe(false);
      expect(readFileSync(join(repo, "source.txt"), "utf8")).toBe("source");
      expect(readFileSync(join(caller, "dist", "keep.txt"), "utf8")).toBe("unrelated");
    }
  });

  it("removes a linked dist without following it to another directory", () => {
    const { repo, caller, entry } = fixture("clean-build.mjs");
    writeFileSync(join(caller, "dist", "keep.txt"), "unrelated");
    symlinkSync(
      join(caller, "dist"),
      join(repo, "dist"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const result = spawnSync(process.execPath, [entry], { cwd: caller, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(repo, "dist"))).toBe(false);
    expect(readFileSync(join(caller, "dist", "keep.txt"), "utf8")).toBe("unrelated");
  });

  it.each([0, 7])(
    "passes analysis arguments and environment without a shell, preserving exit %s",
    (exitCode) => {
      const { repo, caller, entry } = fixture("analyze-build.mjs");
      mkdirSync(join(repo, "node_modules", "vite", "bin"), { recursive: true });
      writeFileSync(join(repo, "package.json"), JSON.stringify({ type: "module" }));
      writeFileSync(
        join(repo, "node_modules", "vite", "bin", "vite.js"),
        `console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), visualize: process.env.VISUALIZE, inherited: process.env.BOTBOUND_COMMAND_FIXTURE })); process.exitCode = ${exitCode};`,
      );
      const args = ["--outDir", "a folder & literal value"];
      const result = spawnSync(process.execPath, [entry, ...args], {
        cwd: caller,
        env: { ...process.env, VISUALIZE: "", BOTBOUND_COMMAND_FIXTURE: "preserved" },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(exitCode);
      expect(JSON.parse(result.stdout)).toEqual({
        args: ["build", ...args],
        cwd: repo,
        visualize: "1",
        inherited: "preserved",
      });
    },
  );
});
