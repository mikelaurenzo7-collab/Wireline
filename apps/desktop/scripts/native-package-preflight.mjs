import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

export async function verifyNativePackage(appRoot, platform, arch) {
  if (!["win32", "darwin"].includes(platform) || !["x64", "arm64"].includes(arch)) {
    throw new Error("Desktop packages support Windows/macOS x64 and arm64 only.");
  }
  const directory = resolve(appRoot, "native/bin", platform);
  const expectedName = platform === "win32" ? "BotBound.Native.exe" : "BotBound.Native";
  const info = JSON.parse(await readFile(resolve(directory, "build-info.json"), "utf8"));
  if (info.platform !== platform || info.arch !== arch || info.filename !== expectedName) {
    throw new Error(
      "Rebuild the native helper for this platform and architecture before packaging.",
    );
  }
  const binary = createHash("sha256")
    .update(await readFile(resolve(directory, expectedName)))
    .digest("hex");
  const source = resolve(appRoot, "native", platform === "win32" ? "windows" : "macos");
  const hash = createHash("sha256");
  for (const file of (await readdir(source))
    .filter((entry) => /\.(cs|csproj|manifest|swift)$/.test(entry))
    .sort()) {
    hash
      .update(file)
      .update("\0")
      .update(await readFile(resolve(source, file)));
  }
  if (binary !== info.binarySha256 || hash.digest("hex") !== info.sourceSha256) {
    throw new Error("The native helper does not match its source. Rebuild it before packaging.");
  }
  return info;
}
