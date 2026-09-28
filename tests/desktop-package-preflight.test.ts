import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyNativePackage } from "../apps/desktop/scripts/native-package-preflight.mjs";

let root: string;
let info: Record<string, unknown>;
const source = "native fixture";
const executable = "compiled fixture";
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "botbound-desktop-package-"));
  await mkdir(join(root, "native/windows"), { recursive: true });
  await mkdir(join(root, "native/bin/win32"), { recursive: true });
  await writeFile(join(root, "native/windows/Program.cs"), source);
  await writeFile(join(root, "native/bin/win32/BotBound.Native.exe"), executable);
  info = {
    platform: "win32",
    arch: "x64",
    filename: "BotBound.Native.exe",
    sourceSha256: createHash("sha256")
      .update("Program.cs")
      .update("\0")
      .update(source)
      .digest("hex"),
    binarySha256: createHash("sha256").update(executable).digest("hex"),
    signed: false,
  };
  await writeInfo();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function writeInfo() {
  await writeFile(join(root, "native/bin/win32/build-info.json"), JSON.stringify(info));
}

describe("desktop package native-helper preflight", () => {
  it("accepts only a matching source, binary, platform and architecture", async () => {
    await expect(verifyNativePackage(root, "win32", "x64")).resolves.toMatchObject({
      platform: "win32",
      arch: "x64",
      signed: false,
    });
    await expect(verifyNativePackage(root, "win32", "arm64")).rejects.toThrow("architecture");
  });
  it("rejects a stale compiled helper after native source changes", async () => {
    await writeFile(join(root, "native/windows/Program.cs"), "new source");
    await expect(verifyNativePackage(root, "win32", "x64")).rejects.toThrow("Rebuild");
  });
  it("rejects a modified helper binary even if its architecture matches", async () => {
    await writeFile(join(root, "native/bin/win32/BotBound.Native.exe"), "different binary");
    await expect(verifyNativePackage(root, "win32", "x64")).rejects.toThrow("Rebuild");
  });
  it("rejects an unexpected executable path from build metadata", async () => {
    info.filename = "../../other.exe";
    await writeInfo();
    await expect(verifyNativePackage(root, "win32", "x64")).rejects.toThrow(
      "platform and architecture",
    );
  });
});
