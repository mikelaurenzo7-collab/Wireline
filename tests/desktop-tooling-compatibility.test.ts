import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { crc32 } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const desktopRequire = createRequire(resolve("apps/desktop/package.json"));
const packagerRequire = createRequire(desktopRequire.resolve("@electron/packager/package.json"));
const rebuildRequire = createRequire(desktopRequire.resolve("@electron/rebuild/package.json"));
const gypRequire = createRequire(desktopRequire.resolve("@electron/node-gyp/package.json"));
const { extractElectronZip } = packagerRequire("./dist/unzip.js");
const tar = rebuildRequire("tar");
const gypTar = gypRequire("tar");
const { ExternalEditor } = desktopRequire("external-editor");
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "botbound-desktop-tooling-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// A single stored member, including deliberately unsafe names for the rejection case.
function archive(name: string, content: string) {
  const filename = Buffer.from(name);
  const body = Buffer.from(content);
  const checksum = crc32(body);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x21, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(filename.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x21, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(filename.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + filename.length, 12);
  end.writeUInt32LE(local.length + filename.length + body.length, 16);
  return Buffer.concat([local, filename, body, central, filename, end]);
}

describe("desktop packaging dependency compatibility", () => {
  it("extracts through Forge's actual Electron packager API", async () => {
    const zip = join(root, "fixture.zip");
    const destination = join(root, "output");
    await mkdir(destination);
    await writeFile(zip, archive("resources/fixture.txt", "verified archive"));
    await extractElectronZip(zip, destination);
    expect(await readFile(join(destination, "resources/fixture.txt"), "utf8")).toBe(
      "verified archive",
    );
  });

  it("rejects a traversing ZIP member without writing outside the destination", async () => {
    const zip = join(root, "unsafe.zip");
    const destination = join(root, "output");
    await mkdir(destination);
    await writeFile(zip, archive("../escaped.txt", "must not be written"));
    await expect(extractElectronZip(zip, destination)).rejects.toThrow();
    await expect(readFile(join(root, "escaped.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves rebuild file extraction and node-gyp streaming/filter extraction", async () => {
    const source = join(root, "source");
    const fileOutput = join(root, "file-output");
    const streamOutput = join(root, "stream-output");
    await mkdir(join(source, "headers"), { recursive: true });
    await mkdir(fileOutput);
    await mkdir(streamOutput);
    await writeFile(join(source, "headers/node.h"), "header fixture");
    await writeFile(join(source, "headers/skip.txt"), "excluded");
    const path = join(root, "headers.tar");
    await tar.c({ file: path, cwd: source }, ["headers"]);
    await tar.x({ file: path, cwd: fileOutput });
    expect(await readFile(join(fileOutput, "headers/node.h"), "utf8")).toBe("header fixture");
    await pipeline(
      createReadStream(path),
      gypTar.extract({
        cwd: streamOutput,
        strip: 1,
        filter: (name: string) => name.endsWith("node.h"),
      }),
    );
    expect(await readFile(join(streamOutput, "node.h"), "utf8")).toBe("header fixture");
    await expect(readFile(join(streamOutput, "skip.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("preserves the temporary-file API used by Forge's external-editor dependency", async () => {
    const editor = new ExternalEditor("draft fixture", { dir: root, prefix: "botbound-" });
    try {
      expect(await readFile(editor.tempFile, "utf8")).toBe("draft fixture");
    } finally {
      editor.cleanup();
    }
    await expect(readFile(editor.tempFile)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
