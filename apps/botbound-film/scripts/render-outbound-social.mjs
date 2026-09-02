import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertExactMasterSet, assertMediaDelivery, resolveMediaTools } from "./lib/media-qa.mjs";
import {
  OUTBOUND_RENDER_FLAGS,
  OUTBOUND_SOCIAL_DELIVERIES,
  captureOutboundSourceContext,
  describeMediaTool,
  sha256File,
} from "./lib/motion-release.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = dirname(scriptPath);
const projectDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(projectDirectory, "..", "..");
const outputDirectory = join(
  repositoryDirectory,
  "brand-work",
  "launch-2026-09-outbound",
  "exports",
  "motion",
);
const remotionCli = join(projectDirectory, "node_modules", "@remotion", "cli", "remotion-cli.js");
const remotionEntry = join(projectDirectory, "src", "index.ts");
const shimPath = join(projectDirectory, "scripts", "remotion-network-shim.cjs");
const metadataPath = join(outputDirectory, "metadata.json");
const checksumPath = join(outputDirectory, "SHA256SUMS.txt");
const qaDirectory = join(outputDirectory, "qa");
const renderReceiptPath = join(outputDirectory, "render-provenance.json");
const transactionRoot = join(outputDirectory, "_render-staging");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: projectDirectory,
    encoding: options.encoding,
    env: options.env,
    stdio: options.stdio,
  });
  if (result.status !== 0) {
    const detail = result.error?.message || result.stderr || result.stdout || "no process output";
    throw new Error(`${command} failed (${result.status ?? "no exit code"}): ${detail}`);
  }
  return result.stdout;
};

const probe = (ffprobe, filePath) =>
  JSON.parse(
    run(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath], {
      encoding: "utf8",
    }),
  );

await mkdir(outputDirectory, { recursive: true });

// The metadata/checksum pair is the approval marker. Invalidate it and the
// prior render receipt before any expensive or destructive work so a crash can
// never leave stale approval attached to old or partially replaced masters.
await Promise.all([
  rm(metadataPath, { force: true }),
  rm(checksumPath, { force: true }),
  rm(qaDirectory, { recursive: true, force: true }),
  rm(renderReceiptPath, { force: true }),
  rm(transactionRoot, { recursive: true, force: true }),
]);
await mkdir(transactionRoot, { recursive: true });

const transactionDirectory = await mkdtemp(join(transactionRoot, ".first-move-render-"));
const stagedMastersDirectory = join(transactionDirectory, "masters");
const backupDirectory = join(transactionDirectory, "previous-masters");
const stagedReceiptPath = join(transactionDirectory, "render-provenance.json");
await Promise.all([
  mkdir(stagedMastersDirectory, { recursive: true }),
  mkdir(backupDirectory, { recursive: true }),
]);

const movedOriginals = [];
const installedMasters = [];
let installStarted = false;

try {
  const { ffmpeg, ffprobe } = resolveMediaTools(projectDirectory);
  const source = captureOutboundSourceContext({
    projectDirectory,
    repositoryDirectory,
    rendererPath: scriptPath,
  });
  const renderEnvironment = {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${shimPath}`].filter(Boolean).join(" "),
  };

  for (const delivery of OUTBOUND_SOCIAL_DELIVERIES) {
    const stagedOutputPath = join(stagedMastersDirectory, delivery.fileName);
    run(
      process.execPath,
      [
        remotionCli,
        "render",
        remotionEntry,
        delivery.composition,
        stagedOutputPath,
        ...OUTBOUND_RENDER_FLAGS,
      ],
      { env: renderEnvironment, stdio: "inherit" },
    );
  }

  assertExactMasterSet(stagedMastersDirectory, OUTBOUND_SOCIAL_DELIVERIES);
  const masters = [];
  for (const delivery of OUTBOUND_SOCIAL_DELIVERIES) {
    const stagedOutputPath = join(stagedMastersDirectory, delivery.fileName);
    assertMediaDelivery(probe(ffprobe, stagedOutputPath), delivery);
    masters.push({
      composition: delivery.composition,
      file: delivery.fileName,
      bytes: (await stat(stagedOutputPath)).size,
      sha256: sha256File(stagedOutputPath),
    });
  }

  const receipt = {
    schema: "botbound.outbound-motion-render.v1",
    campaign: "THE FIRST MOVE",
    renderedAt: new Date().toISOString(),
    ...source,
    mediaTools: {
      ffmpeg: describeMediaTool(ffmpeg),
      ffprobe: describeMediaTool(ffprobe),
    },
    masters,
  };
  await writeFile(stagedReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  // All three staged masters are now byte-bound and delivery-valid. Move the
  // previous root-level MP4 set aside, install the new set, then publish the
  // receipt last. Any in-process failure rolls back; a hard crash remains
  // visibly unapproved because the approval pair and receipt were invalidated.
  installStarted = true;
  const originalMasterNames = (await readdir(outputDirectory))
    .filter((name) => name.toLowerCase().endsWith(".mp4"))
    .sort();
  for (const fileName of originalMasterNames) {
    await rename(join(outputDirectory, fileName), join(backupDirectory, fileName));
    movedOriginals.push(fileName);
  }
  for (const delivery of OUTBOUND_SOCIAL_DELIVERIES) {
    await rename(
      join(stagedMastersDirectory, delivery.fileName),
      join(outputDirectory, delivery.fileName),
    );
    installedMasters.push(delivery.fileName);
  }

  assertExactMasterSet(outputDirectory, OUTBOUND_SOCIAL_DELIVERIES);
  for (const master of masters) {
    const installedPath = join(outputDirectory, master.file);
    if (sha256File(installedPath) !== master.sha256) {
      throw new Error(`Installed outbound motion master failed byte verification: ${master.file}`);
    }
  }
  await rename(stagedReceiptPath, renderReceiptPath);
  console.log(
    `Rendered and installed ${OUTBOUND_SOCIAL_DELIVERIES.length} exact outbound masters. Run qa:outbound-social to publish approval metadata.`,
  );
} catch (error) {
  if (installStarted) {
    await Promise.all(
      installedMasters.map((fileName) => rm(join(outputDirectory, fileName), { force: true })),
    );
    for (const fileName of movedOriginals) {
      await rename(join(backupDirectory, fileName), join(outputDirectory, fileName));
    }
  }
  throw error;
} finally {
  await rm(transactionDirectory, { recursive: true, force: true });
  await rm(transactionRoot, { recursive: true, force: true });
}
