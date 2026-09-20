import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

const scope = [
  "src",
  "public",
  "scripts",
  "index.html",
  "design-tokens",
  "vite.config.ts",
  "tsconfig*.json",
  "tailwind.config.*",
  "postcss.config.*",
  "package.json",
  "package-lock.json",
];
export function readProductProofSource(repositoryRoot) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
  const commit = git(["rev-parse", "HEAD"]).trim();
  const hash = createHash("sha256").update(JSON.stringify({ commit, scope }));
  hash.update(git(["diff", "--binary", "HEAD", "--", ...scope]));
  const untracked = git(["ls-files", "--others", "--exclude-standard", "-z", "--", ...scope])
    .split("\0")
    .filter(Boolean)
    .sort();
  for (const filename of untracked) {
    const bytes = readFileSync(path.join(repositoryRoot, filename));
    hash.update(JSON.stringify({ filename, bytes: bytes.byteLength }));
    hash.update(bytes);
  }
  return {
    revision: {
      commit,
      branch: git(["branch", "--show-current"]).trim(),
      dirty: Boolean(git(["status", "--porcelain"]).trim()),
    },
    sourceSnapshot: {
      sha256: hash.digest("hex"),
      scope,
      includesUntracked: true,
      basis: "Git HEAD, tracked changes, and non-ignored untracked inputs",
      excludes: ["ignored files", "environment values", "installed dependency bytes"],
    },
  };
}
