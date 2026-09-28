import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  source: "frozen source",
  changeDuringBuild: false,
  writeFile: vi.fn(),
  rm: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("node:process", () => ({
  default: {
    argv: ["node", "build.mjs", "--platform", "win32", "--arch", "x64"],
    platform: "win32",
    arch: "x64",
    env: {},
    stdout: { write: vi.fn() },
  },
}));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  chmod: vi.fn(),
  rm: fixture.rm,
  writeFile: fixture.writeFile,
  readdir: vi.fn(async () => ["Program.cs"]),
  readFile: vi.fn(async (path: string) =>
    Buffer.from(path.endsWith("Program.cs") ? fixture.source : "compiled binary"),
  ),
}));
vi.mock("node:child_process", () => ({ spawnSync: fixture.spawn }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  fixture.source = "frozen source";
  fixture.changeDuringBuild = false;
  fixture.spawn.mockImplementation(() => {
    if (fixture.changeDuringBuild) fixture.source = "edited while compiler ran";
    return { status: 0 };
  });
});

describe("native build source attestation", () => {
  it("refuses metadata when source changes while the mocked compiler runs", async () => {
    fixture.changeDuringBuild = true;
    await expect(import("../apps/desktop/native/build.mjs")).rejects.toThrow(
      "source changed during compilation",
    );
    expect(fixture.spawn).toHaveBeenCalledOnce();
    expect(fixture.rm).toHaveBeenCalledWith(expect.stringMatching(/build-info\.json$/), {
      force: true,
    });
    expect(fixture.writeFile).not.toHaveBeenCalled();
  });
  it("writes the frozen source and binary hashes only after a successful unchanged build", async () => {
    await import("../apps/desktop/native/build.mjs");
    expect(fixture.spawn).toHaveBeenCalledOnce();
    expect(fixture.writeFile).toHaveBeenCalledOnce();
    const receipt = JSON.parse(fixture.writeFile.mock.calls[0][1]);
    expect(receipt).toMatchObject({
      platform: "win32",
      arch: "x64",
      filename: "BotBound.Native.exe",
      signed: false,
    });
    expect(receipt.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.binarySha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
