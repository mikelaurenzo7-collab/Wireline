import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// @ts-expect-error -- plain .mjs helper shared by release scripts.
import { verifyCertifiedMediaRecord } from "./certified-media.mjs";

const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

describe("certified launch media", () => {
  let repoRoot = "";
  let marketingRoot = "";
  let mediaPath = "";
  const bytes = Buffer.from("certified BotBound launch media");

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "botbound-certified-media-"));
    marketingRoot = join(repoRoot, "marketing-kit");
    mediaPath = join(marketingRoot, "videos", "launch.webm");
    await mkdir(join(marketingRoot, "videos"), { recursive: true });
    await writeFile(mediaPath, bytes);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  const record = () => ({
    path: "marketing-kit/videos/launch.webm",
    sizeBytes: bytes.length,
    sha256: digest(bytes),
  });

  it("accepts only the certified path, size, and exact bytes", async () => {
    const verifiedBytes = await verifyCertifiedMediaRecord(record(), {
      repoRoot,
      marketingRoot,
      expectedPath: "marketing-kit/videos/launch.webm",
      allowedExtensions: [".webm"],
    });
    expect(verifiedBytes).toEqual(bytes);

    await writeFile(mediaPath, Buffer.from("substituted launch media bytes"));
    expect(verifiedBytes).toEqual(bytes);
    await expect(verifyCertifiedMediaRecord(record(), { repoRoot, marketingRoot })).rejects.toThrow(
      /(size|bytes) changed after capture/,
    );
  });

  it("rejects traversal, unsupported extensions, and symlinks", async () => {
    await expect(
      verifyCertifiedMediaRecord(
        { ...record(), path: "marketing-kit/videos/../secret.webm" },
        {
          repoRoot,
          marketingRoot,
        },
      ),
    ).rejects.toThrow("not canonical");

    await expect(
      verifyCertifiedMediaRecord(record(), {
        repoRoot,
        marketingRoot,
        allowedExtensions: [".mp4"],
      }),
    ).rejects.toThrow("unsupported extension");

    const outside = join(repoRoot, "outside.webm");
    await writeFile(outside, bytes);
    await rm(mediaPath);
    try {
      await symlink(outside, mediaPath);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes(code)) {
        // Windows requires Developer Mode or elevated symlink privileges. The
        // traversal and extension controls above still run on every platform.
        return;
      }
      throw error;
    }
    await expect(verifyCertifiedMediaRecord(record(), { repoRoot, marketingRoot })).rejects.toThrow(
      "regular file",
    );
  });
});
