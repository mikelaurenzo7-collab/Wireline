import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = new Set(process.argv.slice(2));
for (const arg of args) {
  if (!["--index", "--check"].includes(arg))
    throw new Error("Unknown argument: " + arg + ". Use --index and/or --check.");
}
const repoRoot = process.cwd();
const checksumPath = path.join(repoRoot, "brand-work", "SOURCE-SHA256SUMS.txt");
const existing = await readFile(checksumPath, "utf8");
const entries = existing
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^[a-f0-9]{64}\s{2}(.+)$/i);
    if (!match) throw new Error("Invalid checksum line: " + line);
    return match[1];
  });
if (new Set(entries).size !== entries.length) throw new Error("Duplicate source-checksum paths.");
const refreshed = [];
const mismatches = [];
const sourceMode = args.has("--index") ? "Git index" : "working tree";
for (const relative of entries) {
  const absolute = path.resolve(repoRoot, relative);
  const normalized = path.relative(repoRoot, absolute);
  if (
    !normalized ||
    normalized === ".." ||
    normalized.startsWith(".." + path.sep) ||
    path.isAbsolute(normalized)
  ) {
    throw new Error("Checksum path escaped repository: " + relative);
  }
  const fileStat = await stat(absolute);
  if (!fileStat.isFile()) throw new Error("Checksum target is not a file: " + relative);
  const repoRelative = normalized.split(path.sep).join("/");
  let bytes;
  if (args.has("--index")) {
    try {
      bytes = execFileSync("git", ["show", ":" + repoRelative], {
        cwd: repoRoot,
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      throw new Error(
        "Cannot read staged source: " + repoRelative + ". Stage the reviewed file first.",
        { cause: error },
      );
    }
  } else {
    bytes = await readFile(absolute);
  }
  const line = createHash("sha256").update(bytes).digest("hex") + "  " + repoRelative;
  refreshed.push(line);
  if (!existing.split(/\r?\n/).includes(line)) mismatches.push(repoRelative);
}
if (args.has("--check")) {
  if (mismatches.length)
    throw new Error(sourceMode + " source-checksum mismatches:\n" + mismatches.join("\n"));
  console.log("Verified " + entries.length + " source checksums against the " + sourceMode + ".");
} else {
  await writeFile(checksumPath, refreshed.join("\n") + "\n", "utf8");
  console.log(
    "Refreshed " +
      entries.length +
      " source checksums from the " +
      sourceMode +
      ". No paths were added or staged.",
  );
}
