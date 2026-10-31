import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const rootScripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
const filmScripts = JSON.parse(read("apps/botbound-film/package.json")).scripts as Record<string, string>;
const workflowsDir = resolve(root, ".github/workflows");

describe("workflow npm command integrity", () => {
  it("does not invoke scripts removed from their owning package", () => {
    const failures: string[] = [];
    for (const filename of readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name))) {
      const source = read(`.github/workflows/${filename}`);
      // The dedicated film workflow runs every npm script within apps/botbound-film.
      // Other workflows run repository-root npm scripts.
      const scripts = filename === "brand-film-qa.yml" ? filmScripts : rootScripts;
      for (const [, command] of source.matchAll(/\bnpm(?:\.cmd)?\s+run\s+([a-zA-Z0-9:_-]+)/g)) {
        if (!Object.hasOwn(scripts, command)) failures.push(`${filename}: npm run ${command}`);
      }
    }
    expect(failures, `Missing package scripts:\n${failures.join("\n")}`).toEqual([]);
  });

  it("retains deploy safety checks on the PR verification path", () => {
    const ci = read(".github/workflows/ci.yml");
    for (const command of [
      "route-registry:check",
      "security:routes:check",
      "runtime:policy:check",
      "authz:check",
      "server:bootstrap:check",
    ]) {
      expect(ci).toContain(`npm run ${command}`);
    }
  });
});
