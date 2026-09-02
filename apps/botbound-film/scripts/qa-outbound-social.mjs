import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { Resvg } from "@resvg/resvg-js";

import { assertExactMasterSet, assertMediaDelivery, resolveMediaTools } from "./lib/media-qa.mjs";
import {
  OUTBOUND_SOCIAL_DELIVERIES,
  OUTBOUND_VERTICAL_SAFE_ZONE,
  assertOutboundRenderReceipt,
  captureOutboundSourceContext,
  describeMediaTool,
} from "./lib/motion-release.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = dirname(scriptPath);
const projectDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(projectDirectory, "..", "..");
const rendererPath = join(scriptDirectory, "render-outbound-social.mjs");
const outputDirectory = join(
  repositoryDirectory,
  "brand-work",
  "launch-2026-09-outbound",
  "exports",
  "motion",
);
const qaOutputDirectory = join(outputDirectory, "qa");
const metadataPath = join(outputDirectory, "metadata.json");
const checksumPath = join(outputDirectory, "SHA256SUMS.txt");
const renderReceiptPath = join(outputDirectory, "render-provenance.json");
const stagingParent = join(outputDirectory, "_qa-staging");
const deliveries = OUTBOUND_SOCIAL_DELIVERIES.map((delivery) => ({
  ...delivery,
  times: delivery.qaTimes,
}));

const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: projectDirectory, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
};

const sha256Bytes = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha256 = async (filePath) => sha256Bytes(await readFile(filePath));
const repositoryPath = (filePath) => relative(repositoryDirectory, filePath).split(sep).join("/");

// Metadata and checksums are the publish markers. Remove them before reading or
// validating anything so a failed QA pass cannot leave stale approval behind.
await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  rm(metadataPath, { force: true }),
  rm(checksumPath, { force: true }),
  rm(qaOutputDirectory, { recursive: true, force: true }),
  rm(stagingParent, { recursive: true, force: true }),
]);
await mkdir(stagingParent, { recursive: true });

const stagingDirectory = await mkdtemp(join(stagingParent, ".first-move-qa-"));
const qaDirectory = join(stagingDirectory, "qa");
const stagedMetadataPath = join(stagingDirectory, "metadata.json");
const stagedChecksumPath = join(stagingDirectory, "SHA256SUMS.txt");
const metadata = [];
const qaFrames = [];
const positions = ["find", "call", "book", "end"];

try {
  const { ffmpeg, ffprobe } = resolveMediaTools(projectDirectory);
  const receiptBytes = await readFile(renderReceiptPath);
  const receiptSha256 = sha256Bytes(receiptBytes);
  const receipt = JSON.parse(receiptBytes.toString("utf8"));
  const currentSource = captureOutboundSourceContext({
    projectDirectory,
    repositoryDirectory,
    rendererPath,
  });
  assertOutboundRenderReceipt(receipt, currentSource);
  assertExactMasterSet(outputDirectory, deliveries);
  await mkdir(qaDirectory, { recursive: true });

  const receiptMasterByFile = new Map(receipt.masters.map((master) => [master.file, master]));
  for (const delivery of deliveries) {
    const videoPath = join(outputDirectory, delivery.fileName);
    const probe = JSON.parse(
      run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", videoPath]),
    );
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    const audio = probe.streams.find((stream) => stream.codec_type === "audio");
    assertMediaDelivery(probe, delivery);

    const digest = await sha256(videoPath);
    const bytes = (await stat(videoPath)).size;
    const receiptMaster = receiptMasterByFile.get(delivery.fileName);
    if (receiptMaster?.sha256 !== digest || receiptMaster?.bytes !== bytes) {
      throw new Error(
        `Outbound motion master no longer matches its render receipt: ${delivery.fileName}`,
      );
    }

    metadata.push({
      file: delivery.fileName,
      composition: delivery.composition,
      sha256: digest,
      bytes,
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
      const framePath = join(qaDirectory, `${delivery.stem}-${positions[index]}.png`);
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
  }

  const columns = 4;
  const rows = deliveries.length;
  const cellWidth = 320;
  const cellHeight = 610;
  const svgCells = await Promise.all(
    qaFrames.map(async (framePath, index) => {
      const delivery = deliveries[Math.floor(index / positions.length)];
      const x = (index % columns) * cellWidth;
      const y = Math.floor(index / columns) * cellHeight;
      const label = framePath
        .split(/[\\/]/)
        .at(-1)
        .replace("botbound-first-move-", "")
        .replace(".png", "")
        .replaceAll("&", "&amp;");
      const image = (await readFile(framePath)).toString("base64");
      const verticalSafeZone =
        delivery.height > delivery.width
          ? `<rect x="${x + 18 + (284 * OUTBOUND_VERTICAL_SAFE_ZONE.left) / 1080}" y="${y + 55 + (528 * OUTBOUND_VERTICAL_SAFE_ZONE.top) / 1920}" width="${(284 * (1080 - OUTBOUND_VERTICAL_SAFE_ZONE.left - OUTBOUND_VERTICAL_SAFE_ZONE.right)) / 1080}" height="${(528 * (1920 - OUTBOUND_VERTICAL_SAFE_ZONE.top - OUTBOUND_VERTICAL_SAFE_ZONE.bottom)) / 1920}" rx="8" fill="none" stroke="#5EEAD4" stroke-width="1.5" stroke-dasharray="7 5" opacity="0.72"/>`
          : "";
      return `
      <rect x="${x + 8}" y="${y + 8}" width="304" height="594" rx="20" fill="#11111a" stroke="#302945"/>
      <text x="${x + 22}" y="${y + 39}" fill="#ddd9e8" font-family="Arial, sans-serif" font-size="14" font-weight="700">${label}</text>
      <image x="${x + 18}" y="${y + 55}" width="284" height="528" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${image}"/>
      ${verticalSafeZone}
    `;
    }),
  );
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${columns * cellWidth}" height="${rows * cellHeight}">
    <rect width="100%" height="100%" fill="#06060A"/>
    ${svgCells.join("")}
  </svg>
`;
  const contactSheetPath = join(qaDirectory, "botbound-first-move-motion-qa-contact-sheet.png");
  await writeFile(contactSheetPath, new Resvg(svg).render().asPng());

  const expectedQaFiles = [
    ...deliveries.flatMap((delivery) =>
      positions.map((position) => `${delivery.stem}-${position}.png`),
    ),
    "botbound-first-move-motion-qa-contact-sheet.png",
  ].sort();
  const actualQaFiles = (await readdir(qaDirectory)).sort();
  if (JSON.stringify(actualQaFiles) !== JSON.stringify(expectedQaFiles)) {
    throw new Error("Outbound motion QA evidence inventory is incomplete or contains stale files.");
  }
  const qaArtifacts = await Promise.all(
    actualQaFiles.map(async (file) => {
      const path = join(qaDirectory, file);
      return { file: `qa/${file}`, bytes: (await stat(path)).size, sha256: await sha256(path) };
    }),
  );

  const verifiedAt = new Date().toISOString();
  const qaScriptBytes = await readFile(scriptPath);
  const qaTooling = {
    script: {
      path: repositoryPath(scriptPath),
      bytes: qaScriptBytes.byteLength,
      sha256: sha256Bytes(qaScriptBytes),
    },
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    mediaTools: {
      ffmpeg: describeMediaTool(ffmpeg),
      ffprobe: describeMediaTool(ffprobe),
    },
  };

  // Recheck the mutable inputs immediately before publication. Metadata is
  // renamed last, so it exists only when the receipt, masters, and QA evidence
  // all describe the same exact bytes.
  if ((await sha256(renderReceiptPath)) !== receiptSha256) {
    throw new Error("Outbound render receipt changed during media QA.");
  }
  assertExactMasterSet(outputDirectory, deliveries);
  for (const entry of metadata) {
    if ((await sha256(join(outputDirectory, entry.file))) !== entry.sha256) {
      throw new Error(`Outbound motion master changed during media QA: ${entry.file}`);
    }
  }

  await writeFile(
    stagedMetadataPath,
    `${JSON.stringify(
      {
        schema: "botbound.outbound-motion-qa.v2",
        generatedAt: verifiedAt,
        campaign: "THE FIRST MOVE",
        verification: {
          state: "automated-delivery-qa-passed",
          exactMasterCount: deliveries.length,
          humanVisualReviewRequired: true,
        },
        audioProgram: {
          spokenDialogue: false,
          content: "Original BotBound score and UI confirmation chime only.",
          captionSidecars:
            "Not applicable: there is no spoken dialogue and campaign copy is burned in.",
        },
        platformSafeZone: {
          canvas: "1080x1920",
          ...OUTBOUND_VERTICAL_SAFE_ZONE,
          note: "Dashed mint guides appear only on the QA contact sheet, never in the masters.",
        },
        provenance: {
          renderReceipt: {
            file: "render-provenance.json",
            sha256: receiptSha256,
          },
          sourceFingerprint: receipt.sourceFingerprint,
          renderer: receipt.renderer,
          inputs: receipt.inputs,
          inputBundleSha256: receipt.inputBundleSha256,
          runtime: receipt.runtime,
          renderConfigSha256: receipt.renderConfigSha256,
          renderMediaTools: receipt.mediaTools,
          renderGit: receipt.git,
          verificationGit: currentSource.git,
          qa: qaTooling,
        },
        deliveries: metadata,
        qaContactSheet: "qa/botbound-first-move-motion-qa-contact-sheet.png",
        qaArtifacts,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    stagedChecksumPath,
    `${metadata.map((entry) => `${entry.sha256}  ${entry.file}`).join("\n")}\n`,
    "utf8",
  );

  await rename(qaDirectory, qaOutputDirectory);
  await rename(stagedChecksumPath, checksumPath);
  await rename(stagedMetadataPath, metadataPath);
  console.log(
    `Verified ${deliveries.length} exact First Move masters and wrote ${qaFrames.length} provenance-bound QA frames.`,
  );
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
  await rm(stagingParent, { recursive: true, force: true });
}
