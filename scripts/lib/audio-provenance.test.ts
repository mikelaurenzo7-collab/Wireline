import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// @ts-expect-error -- plain .mjs helper shared by generation scripts.
import {
  audioProvenanceMatches,
  audioSha256,
  readAudioProvenance,
  writeAudioProvenance,
} from "./audio-provenance.mjs";

describe("generated-audio provenance", () => {
  let directory = "";
  let audioPath = "";

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "botbound-audio-provenance-"));
    audioPath = join(directory, "track.mp3");
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("binds reusable provenance to both the complete recipe and exact audio bytes", async () => {
    const audio = Buffer.from("verified audio bytes");
    const recipe = audioSha256("complete recipe v1");
    await writeFile(audioPath, audio);
    await writeAudioProvenance(audioPath, recipe, audio, { prompt: "BotBound" });

    expect(await audioProvenanceMatches(audioPath, recipe)).toBe(true);
    expect((await readAudioProvenance(audioPath))?.prompt).toBe("BotBound");
    expect(await audioProvenanceMatches(audioPath, audioSha256("different recipe"))).toBe(false);

    await writeFile(audioPath, Buffer.from("tampered audio bytes"));
    expect(await audioProvenanceMatches(audioPath, recipe)).toBe(false);
  });

  it("rejects malformed or tampered sidecars", async () => {
    const audio = Buffer.from("verified audio bytes");
    const recipe = audioSha256("complete recipe v1");
    await writeFile(audioPath, audio);
    await writeAudioProvenance(audioPath, recipe, audio);

    const provenance = JSON.parse(await readFile(`${audioPath}.sha256`, "utf8"));
    provenance.audio_sha256 = "0".repeat(64);
    await writeFile(`${audioPath}.sha256`, JSON.stringify(provenance));
    expect(await audioProvenanceMatches(audioPath, recipe)).toBe(false);

    await writeFile(`${audioPath}.sha256`, "not json");
    expect(await readAudioProvenance(audioPath)).toBeNull();
  });
});
