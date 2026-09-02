import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { assertExactMasterSet, assertMediaDelivery, resolveMediaTools } from "./lib/media-qa.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(projectDirectory, "..", "..");
const outputDirectory = join(
  repositoryDirectory,
  "brand-work",
  "launch-2026-09",
  "exports",
  "motion",
);
const qaOutputDirectory = join(outputDirectory, "qa");
const metadataPath = join(outputDirectory, "metadata.json");
const checksumPath = join(outputDirectory, "SHA256SUMS.txt");
const stagingParent = join(outputDirectory, "_rejected");

const deliveries = [
  {
    stem: "botbound-second-ring-6s-vertical-1080x1920",
    cut: "6s",
    width: 1080,
    height: 1920,
    durationSeconds: 6,
    colorSpace: "bt709",
    times: [0.7, 2.7, 5.0],
  },
  {
    stem: "botbound-second-ring-10s-square-1080x1080",
    cut: "10s",
    width: 1080,
    height: 1080,
    durationSeconds: 10,
    colorSpace: "bt709",
    times: [0.9, 4.8, 8.3],
  },
  {
    stem: "botbound-second-ring-15s-vertical-1080x1920",
    cut: "15s",
    width: 1080,
    height: 1920,
    durationSeconds: 15,
    colorSpace: "bt709",
    times: [1.2, 6.1, 13.0],
  },
];

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: projectDirectory, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
};

const sha256 = async (filePath) =>
  createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");

await mkdir(outputDirectory, { recursive: true });
await rm(qaOutputDirectory, { recursive: true, force: true });
await rm(metadataPath, { force: true });
await rm(checksumPath, { force: true });
const oldCaptionSidecars = (await readdir(outputDirectory, { withFileTypes: true }))
  .filter(
    (entry) =>
      entry.isFile() &&
      /^botbound-second-ring-(?:6s|10s|15s|30s)\.(?:json|srt|vtt)$/.test(entry.name),
  )
  .map((entry) => join(outputDirectory, entry.name));
await Promise.all(oldCaptionSidecars.map((sidecar) => rm(sidecar, { force: true })));
await mkdir(stagingParent, { recursive: true });
const stagingDirectory = await mkdtemp(join(stagingParent, ".botbound-launch-qa-"));
const qaDirectory = join(stagingDirectory, "qa");
const stagedMetadataPath = join(stagingDirectory, "metadata.json");
const stagedChecksumPath = join(stagingDirectory, "SHA256SUMS.txt");

try {
  const { ffmpeg, ffprobe } = resolveMediaTools(projectDirectory);
  assertExactMasterSet(outputDirectory, deliveries);
  await mkdir(qaDirectory, { recursive: true });
  const metadata = [];
  const sidecars = [];
  const qaFrames = [];

  for (const delivery of deliveries) {
    const videoPath = join(outputDirectory, `${delivery.stem}.mp4`);
    const probe = JSON.parse(
      run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", videoPath]),
    );
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    const audio = probe.streams.find((stream) => stream.codec_type === "audio");
    assertMediaDelivery(probe, delivery);

    metadata.push({
      file: `${delivery.stem}.mp4`,
      sha256: await sha256(videoPath),
      bytes: Number(probe.format.size),
      durationSeconds: Number(probe.format.duration),
      video: {
        codec: video?.codec_name,
        width: video?.width,
        height: video?.height,
        frameRate: video?.avg_frame_rate,
        pixelFormat: video?.pix_fmt,
        colorSpace: video?.color_space,
      },
      audio: {
        codec: audio?.codec_name,
        sampleRate: Number(audio?.sample_rate),
        channels: audio?.channels,
      },
    });

    for (const [index, time] of delivery.times.entries()) {
      const position = ["opening", "mid", "end"][index];
      const framePath = join(qaDirectory, `${delivery.stem}-${position}.png`);
      run(ffmpeg, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String(time),
        "-i",
        videoPath,
        "-frames:v",
        "1",
        framePath,
      ]);
      qaFrames.push(framePath);
    }

    for (const extension of ["json", "srt", "vtt"]) {
      const sidecar = `botbound-second-ring-${delivery.cut}.${extension}`;
      const source = join(projectDirectory, "public", "captions", sidecar);
      const stagedSidecar = join(stagingDirectory, sidecar);
      await copyFile(source, stagedSidecar);
      const bytes = await readFile(stagedSidecar);
      sidecars.push({
        file: sidecar,
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }

  if (qaFrames.length > 0) {
    const columns = 3;
    const rows = Math.ceil(qaFrames.length / columns);
    const cellWidth = 400;
    const cellHeight = 700;
    const svgCells = await Promise.all(
      qaFrames.map(async (framePath, index) => {
        const x = (index % columns) * cellWidth;
        const y = Math.floor(index / columns) * cellHeight;
        const label = framePath
          .split(/[\\/]/)
          .at(-1)
          .replace("botbound-second-ring-", "")
          .replace(".png", "")
          .replaceAll("&", "&amp;");
        const image = (await readFile(framePath)).toString("base64");
        return `
        <rect x="${x + 8}" y="${y + 8}" width="384" height="684" rx="18" fill="#11111a" stroke="#2f2940"/>
        <text x="${x + 24}" y="${y + 40}" fill="#d8d6e2" font-family="Arial, sans-serif" font-size="15" font-weight="700">${label}</text>
        <image x="${x + 20}" y="${y + 56}" width="360" height="624" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${image}"/>
      `;
      }),
    );
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellWidth}" height="${rows * cellHeight}">
      <rect width="100%" height="100%" fill="#08080D"/>
      ${svgCells.join("")}
    </svg>
  `;
    const contactSheet = new Resvg(svg).render().asPng();
    await writeFile(
      join(qaDirectory, "botbound-second-ring-motion-qa-contact-sheet.png"),
      contactSheet,
    );

    metadata.push({ qaContactSheet: `qa/botbound-second-ring-motion-qa-contact-sheet.png`, rows });
  }

  await writeFile(
    stagedMetadataPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), deliveries: metadata, sidecars }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    stagedChecksumPath,
    `${[...metadata.filter((entry) => entry.file), ...sidecars]
      .map((entry) => `${entry.sha256}  ${entry.file}`)
      .join("\n")}\n`,
    "utf8",
  );

  await rename(qaDirectory, qaOutputDirectory);
  for (const sidecar of sidecars) {
    await rename(join(stagingDirectory, sidecar.file), join(outputDirectory, sidecar.file));
  }
  await rename(stagedChecksumPath, checksumPath);
  await rename(stagedMetadataPath, metadataPath);
  console.log(
    `Verified ${deliveries.length} motion masters and wrote ${qaFrames.length} QA frames.`,
  );
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
