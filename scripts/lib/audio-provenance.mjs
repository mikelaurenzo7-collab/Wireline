import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export function audioSha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function readAudioProvenance(audioPath) {
  try {
    const parsed = JSON.parse(await readFile(`${audioPath}.sha256`, "utf8"));
    if (
      parsed?.version !== 1 ||
      !/^[0-9a-f]{64}$/.test(parsed.recipe_sha256 || "") ||
      !/^[0-9a-f]{64}$/.test(parsed.audio_sha256 || "")
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function audioProvenanceMatches(audioPath, expectedRecipeSha256) {
  const provenance = await readAudioProvenance(audioPath);
  if (!provenance || provenance.recipe_sha256 !== expectedRecipeSha256) return false;
  try {
    return audioSha256(await readFile(audioPath)) === provenance.audio_sha256;
  } catch {
    return false;
  }
}

export async function writeAudioProvenance(audioPath, recipeSha256, audio, details = {}) {
  const provenance = {
    ...details,
    version: 1,
    recipe_sha256: recipeSha256,
    audio_sha256: audioSha256(audio),
  };
  await writeFile(`${audioPath}.sha256`, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  return provenance;
}
