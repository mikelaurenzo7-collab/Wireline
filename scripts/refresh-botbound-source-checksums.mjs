import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const checksumPath = path.join(repoRoot, "brand-work", "SOURCE-SHA256SUMS.txt");

const existing = await readFile(checksumPath, "utf8");
const entries = existing
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const match = line.match(/^[a-f0-9]{64}\s{2}(.+)$/i);
    if (!match) throw new Error(`Invalid checksum line: ${line}`);
    return match[1];
  });

const refreshed = [];
for (const relative of entries) {
  const absolute = path.resolve(repoRoot, relative);
  const safePrefix = `${path.resolve(repoRoot)}${path.sep}`;
  if (!absolute.startsWith(safePrefix)) throw new Error(`Checksum path escaped repository: ${relative}`);
  const fileStat = await stat(absolute);
  if (!fileStat.isFile()) throw new Error(`Checksum target is not a file: ${relative}`);
  const digest = createHash("sha256").update(await readFile(absolute)).digest("hex");
  refreshed.push(`${digest}  ${relative.split(path.sep).join("/")}`);
}

await writeFile(checksumPath, `${refreshed.join("\n")}\n`, "utf8");
console.log(`Refreshed ${entries.length} source checksums in ${path.relative(repoRoot, checksumPath)}.`);
