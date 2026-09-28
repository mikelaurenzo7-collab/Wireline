import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile, chmod, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing ${name} value.`);
  return value;
}
const platform = option("--platform", process.platform);
const arch = option("--arch", process.arch);
if (!["win32", "darwin"].includes(platform) || !["x64", "arm64"].includes(arch))
  throw new Error("Native builds support Windows/macOS x64 and arm64 only.");
if (platform !== process.platform)
  throw new Error(
    `Build ${platform} helpers on a ${platform} host. Cross-platform packages must not silently include an unbuilt helper.`,
  );

const source = resolve(root, platform === "win32" ? "windows" : "macos");
const output = resolve(root, "bin", platform);
await mkdir(output, { recursive: true });
const filename = platform === "win32" ? "BotBound.Native.exe" : "BotBound.Native";
const executable = resolve(output, filename);
async function sourceDigest() {
  const hash = createHash("sha256");
  for (const file of (await readdir(source))
    .filter((entry) => /\.(cs|csproj|manifest|swift)$/.test(entry))
    .sort()) {
    hash
      .update(file)
      .update("\0")
      .update(await readFile(resolve(source, file)));
  }
  return hash.digest("hex");
}
const sourceBefore = await sourceDigest();
await rm(resolve(output, "build-info.json"), { force: true });
function run(command, argv) {
  const result = spawnSync(command, argv, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(`Native compilation failed (${command}). No release artifact was certified.`);
}
if (platform === "win32") {
  run(process.env.BOTBOUND_DOTNET_PATH || "dotnet", [
    "publish",
    resolve(source, "BotBound.Native.csproj"),
    "-c",
    "Release",
    "-r",
    `win-${arch}`,
    "--self-contained",
    "true",
    "-o",
    output,
  ]);
} else {
  run("xcrun", [
    "swiftc",
    "-O",
    "-target",
    `${arch === "arm64" ? "arm64" : "x86_64"}-apple-macos13.0`,
    "-framework",
    "AppKit",
    "-framework",
    "ApplicationServices",
    "-framework",
    "CoreGraphics",
    resolve(source, "main.swift"),
    "-o",
    executable,
  ]);
  await chmod(executable, 0o755);
}
const sourceAfter = await sourceDigest();
if (sourceAfter !== sourceBefore)
  throw new Error(
    "Native source changed during compilation. No release artifact was certified; rebuild from frozen source.",
  );
const binarySha256 = createHash("sha256")
  .update(await readFile(executable))
  .digest("hex");
await writeFile(
  resolve(output, "build-info.json"),
  `${JSON.stringify(
    {
      platform,
      arch,
      filename,
      sourceSha256: sourceBefore,
      binarySha256,
      builtAt: new Date().toISOString(),
      signed: false,
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(
  `Native helper compiled for ${platform}/${arch}. Signing and interactive OS acceptance remain separate release checks.\n`,
);
