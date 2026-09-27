import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  events: [] as { operation: string; path: string; destination?: string }[],
  renderCount: 0,
  failRender: 0,
  failWriteSuffix: "",
  failRename: false,
}));

// Every filesystem operation made by the renderer stays in memory. The real
// checked-in artwork and receipts are never touched by these failure probes.
vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  readFileSync: (path: string) => {
    const stored = memory.files.get(path);
    if (stored) return stored;
    if (path.endsWith("stay-in-the-work.png") || path.endsWith("botbound-operator-polished.png")) {
      return Buffer.from("source image fixture");
    }
    throw new Error(`Missing virtual file: ${path}`);
  },
  writeFileSync: (path: string, value: string | Buffer) => {
    memory.events.push({ operation: "write", path });
    if (memory.failWriteSuffix && path.endsWith(memory.failWriteSuffix)) {
      throw new Error("Injected write failure");
    }
    memory.files.set(path, Buffer.from(value));
  },
  rmSync: (path: string) => {
    memory.events.push({ operation: "remove", path });
    memory.files.delete(path);
  },
  renameSync: (path: string, destination: string) => {
    memory.events.push({ operation: "rename", path, destination });
    if (memory.failRename) throw new Error("Injected rename failure");
    const source = memory.files.get(path);
    if (!source) throw new Error("Missing staged receipt");
    memory.files.set(destination, source);
    memory.files.delete(path);
  },
}));

vi.mock("@resvg/resvg-js", () => ({
  Resvg: class {
    render() {
      const index = ++memory.renderCount;
      if (index === memory.failRender) throw new Error("Injected render failure");
      return { asPng: () => Buffer.from(`rendered PNG ${index}`) };
    }
  },
}));

const campaign = resolve("brand-work/launch-2026-09-refresh");
const output = resolve(campaign, "exports");
const manifest = resolve(output, "manifest.json");
const stagedManifest = resolve(output, `manifest-${process.pid}.tmp`);
const contactSheet = resolve(campaign, "qa/contact-sheet.png");
const originalArgv = process.argv;

async function render() {
  // @ts-expect-error -- executable .mjs renderer has no declaration file.
  await import("./render-botbound-refresh-assets.mjs");
}

beforeEach(() => {
  process.argv = originalArgv.slice(0, 2);
  vi.resetModules();
  memory.files.clear();
  memory.events.length = 0;
  memory.renderCount = 0;
  memory.failRender = 0;
  memory.failWriteSuffix = "";
  memory.failRename = false;
  memory.files.set(manifest, Buffer.from('{"assets":["previous batch"]}'));
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
});

describe("refresh creative batch receipts", () => {
  it.each(["separate", "equals"])(
    "keeps %s output arguments outside the historical local delivery",
    async (syntax) => {
      const externalOutput = resolve("../external-creative-review");
      process.argv.push(
        ...(syntax === "equals" ? [`--output=${externalOutput}`] : ["--output", externalOutput]),
      );

      await render();

      expect(memory.events.every((event) => event.path.startsWith(externalOutput))).toBe(true);
      expect(memory.files.get(manifest)?.toString()).toBe('{"assets":["previous batch"]}');
      expect(memory.files.has(resolve(externalOutput, "qa/contact-sheet.png"))).toBe(true);
      const receipt = JSON.parse(
        memory.files.get(resolve(externalOutput, "manifest.json"))!.toString(),
      );
      expect(receipt.assets).toHaveLength(10);
      expect(
        memory.files
          .get(resolve(externalOutput, "svg/botbound-stay-in-the-work-feed.svg"))
          ?.toString(),
      ).toContain("Private testing free. Live activation paused.");
    },
  );

  it.each([
    { name: "missing path", args: ["--output"] },
    { name: "option in place of path", args: ["--output", "--unknown"] },
    { name: "empty equals path", args: ["--output="] },
    { name: "blank path", args: ["--output", " "] },
    { name: "misspelled option", args: ["--ouput", "external-review"] },
    { name: "misspelled equals option", args: ["--ouput=external-review"] },
    { name: "unexpected positional path", args: ["external-review"] },
    { name: "duplicate output", args: ["--output", "first", "--output=second"] },
    { name: "unknown option after valid output", args: ["--output", "external-review", "--nope"] },
  ])("rejects $name before changing files", async ({ args }) => {
    process.argv.push(...args);

    await expect(render()).rejects.toThrow(/No release assets were changed/);

    expect(memory.events).toEqual([]);
    expect(memory.renderCount).toBe(0);
    expect(memory.files.get(manifest)?.toString()).toBe('{"assets":["previous batch"]}');
  });

  it("invalidates the old receipt before output writes and atomically installs a complete batch", async () => {
    await render();

    expect(memory.events[0]).toEqual({ operation: "remove", path: manifest });
    expect(memory.events.filter((event) => event.operation === "rename")).toEqual([
      { operation: "rename", path: stagedManifest, destination: manifest },
    ]);
    expect(
      memory.events.some((event) => event.operation === "write" && event.path === manifest),
    ).toBe(false);
    const renameIndex = memory.events.findIndex((event) => event.operation === "rename");
    const completedWrites = memory.events
      .slice(0, renameIndex)
      .filter((event) => event.operation === "write");
    expect(
      completedWrites.filter((event) => event.path.startsWith(resolve(output, "png"))),
    ).toHaveLength(10);
    expect(
      completedWrites.filter((event) => event.path.startsWith(resolve(output, "svg"))),
    ).toHaveLength(10);
    expect(completedWrites.map((event) => event.path)).toContain(contactSheet);
    expect(completedWrites.at(-1)?.path).toBe(stagedManifest);
    expect(memory.files.has(stagedManifest)).toBe(false);
    expect(memory.renderCount).toBe(11);

    const receipt = JSON.parse(memory.files.get(manifest)!.toString()) as {
      assets: { name: string; bytes: number; sha256: string }[];
    };
    expect(receipt.assets).toHaveLength(10);
    expect(new Set(receipt.assets.map((asset) => asset.name)).size).toBe(10);
    for (const asset of receipt.assets) {
      const png = memory.files.get(resolve(output, "png", `${asset.name}.png`))!;
      expect(memory.files.has(resolve(output, "svg", `${asset.name}.svg`))).toBe(true);
      expect(asset.bytes).toBe(png.length);
      expect(asset.sha256).toBe(createHash("sha256").update(png).digest("hex"));
    }
  });

  it.each([
    { name: "mid-batch rasterization", render: 4 },
    { name: "an editable SVG write", write: "botbound-small-team-feed.svg" },
    { name: "contact-sheet rasterization", render: 11 },
    { name: "the contact-sheet write", write: "contact-sheet.png" },
    { name: "the staged receipt write", write: `manifest-${process.pid}.tmp` },
    { name: "the atomic receipt rename", rename: true },
  ])("leaves no current receipt when $name fails", async (failure) => {
    memory.failRender = failure.render ?? 0;
    memory.failWriteSuffix = failure.write ?? "";
    memory.failRename = failure.rename ?? false;

    await expect(render()).rejects.toThrow(/Injected (render|write|rename) failure/);

    expect(memory.events[0]).toEqual({ operation: "remove", path: manifest });
    expect(memory.files.has(manifest)).toBe(false);
    expect(memory.files.has(stagedManifest)).toBe(false);
  });
});
