import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";

export const OUTBOUND_SOCIAL_DELIVERIES = Object.freeze([
  Object.freeze({
    composition: "BotBound-FirstMove-15s-Vertical",
    stem: "botbound-first-move-15s-vertical-1080x1920",
    fileName: "botbound-first-move-15s-vertical-1080x1920.mp4",
    width: 1080,
    height: 1920,
    durationSeconds: 15,
    colorSpace: "bt709",
    qaTimes: Object.freeze([1.5, 5.1, 8.8, 12.7]),
  }),
  Object.freeze({
    composition: "BotBound-FirstMove-10s-Square",
    stem: "botbound-first-move-10s-square-1080x1080",
    fileName: "botbound-first-move-10s-square-1080x1080.mp4",
    width: 1080,
    height: 1080,
    durationSeconds: 10,
    colorSpace: "bt709",
    qaTimes: Object.freeze([0.9, 3, 5.4, 8.4]),
  }),
  Object.freeze({
    composition: "BotBound-FirstMove-6s-Vertical",
    stem: "botbound-first-move-6s-vertical-1080x1920",
    fileName: "botbound-first-move-6s-vertical-1080x1920.mp4",
    width: 1080,
    height: 1920,
    durationSeconds: 6,
    colorSpace: "bt709",
    qaTimes: Object.freeze([0.55, 1.85, 3.15, 5.2]),
  }),
]);

export const OUTBOUND_RENDER_FLAGS = Object.freeze([
  "--codec=h264",
  "--crf=16",
  "--pixel-format=yuv420p",
  "--color-space=bt709",
  "--audio-codec=aac",
  "--audio-bitrate=256k",
  "--concurrency=1",
]);

export const OUTBOUND_VERTICAL_SAFE_ZONE = Object.freeze({
  top: 220,
  right: 144,
  bottom: 340,
  left: 96,
});

const toPosix = (value) => value.split(sep).join("/");

export const sha256Buffer = (value) => createHash("sha256").update(value).digest("hex");
export const sha256File = (filePath) => sha256Buffer(readFileSync(filePath));
export const sha256Json = (value) => sha256Buffer(JSON.stringify(value));

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

function fileRecord(repositoryDirectory, filePath) {
  const stats = statSync(filePath);
  return {
    path: toPosix(relative(repositoryDirectory, filePath)),
    bytes: stats.size,
    sha256: sha256File(filePath),
  };
}

function commandOutput(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function gitContext(repositoryDirectory, paths) {
  const repositoryPaths = paths
    .map((path) => toPosix(relative(repositoryDirectory, path)))
    .filter((path) => path && !path.startsWith("../"));
  const status = commandOutput(
    "git",
    ["status", "--porcelain=v1", "--", ...repositoryPaths],
    repositoryDirectory,
  );
  return {
    commit: commandOutput("git", ["rev-parse", "HEAD"], repositoryDirectory),
    branch: commandOutput("git", ["branch", "--show-current"], repositoryDirectory),
    exactInputsDirty: status === null ? null : status.length > 0,
  };
}

function renderConfig() {
  return {
    deliveries: OUTBOUND_SOCIAL_DELIVERIES.map(
      ({ composition, fileName, width, height, durationSeconds }) => ({
        composition,
        fileName,
        width,
        height,
        durationSeconds,
        fps: 30,
      }),
    ),
    flags: [...OUTBOUND_RENDER_FLAGS],
    verticalSafeZone: OUTBOUND_VERTICAL_SAFE_ZONE,
  };
}

/**
 * Capture the exact renderer, source, and pinned runtime inputs for an outbound
 * render. File hashes, rather than a clean-git claim, bind dirty worktree
 * renders to the bytes that actually produced them.
 */
export function captureOutboundSourceContext({
  projectDirectory,
  repositoryDirectory,
  rendererPath,
}) {
  const inputPaths = [
    resolve(projectDirectory, "src/index.ts"),
    resolve(projectDirectory, "src/Root.tsx"),
    resolve(projectDirectory, "src/global.css"),
    resolve(projectDirectory, "src/components/Brand.tsx"),
    ...walkFiles(resolve(projectDirectory, "src/outbound")),
    resolve(projectDirectory, "public/audio/botbound-score.mp3"),
    resolve(projectDirectory, "public/audio/transfer-chime-approved.wav"),
    resolve(projectDirectory, "public/brand/botbound-app-icon.png"),
    resolve(projectDirectory, "public/fonts/Inter-Variable.woff2"),
    resolve(projectDirectory, "public/fonts/InterTight-Variable.woff2"),
    resolve(projectDirectory, "public/fonts/IBMPlexMono-Bold.woff2"),
  ].sort();
  const runtimePaths = [
    resolve(projectDirectory, "package.json"),
    resolve(projectDirectory, "package-lock.json"),
    resolve(projectDirectory, "scripts/remotion-network-shim.cjs"),
    resolve(projectDirectory, "scripts/lib/media-qa.mjs"),
    resolve(projectDirectory, "scripts/lib/motion-release.mjs"),
    resolve(projectDirectory, "node_modules/@remotion/cli/remotion-cli.js"),
  ];
  const inputs = inputPaths.map((path) => fileRecord(repositoryDirectory, path));
  const runtimeFiles = runtimePaths.map((path) => fileRecord(repositoryDirectory, path));
  const renderer = fileRecord(repositoryDirectory, rendererPath);
  const config = renderConfig();
  const inputBundleSha256 = sha256Json(inputs);
  const runtimeBundleSha256 = sha256Json(runtimeFiles);
  const renderConfigSha256 = sha256Json(config);
  const sourceFingerprint = sha256Json({
    rendererSha256: renderer.sha256,
    inputBundleSha256,
    runtimeBundleSha256,
    renderConfigSha256,
  });
  const packageJson = JSON.parse(readFileSync(resolve(projectDirectory, "package.json"), "utf8"));

  return {
    renderer,
    inputs,
    inputBundleSha256,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      remotion: packageJson.dependencies?.remotion ?? null,
      files: runtimeFiles,
      bundleSha256: runtimeBundleSha256,
    },
    renderConfig: config,
    renderConfigSha256,
    sourceFingerprint,
    git: gitContext(repositoryDirectory, [rendererPath, ...inputPaths, ...runtimePaths]),
  };
}

export function describeMediaTool(command) {
  const result = spawnSync(command, ["-version"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `Cannot fingerprint ${basename(command)}: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return {
    executable: basename(command),
    version: output.split(/\r?\n/, 1)[0] || "unknown",
    versionOutputSha256: sha256Buffer(output),
  };
}

export function assertOutboundRenderReceipt(receipt, currentContext) {
  if (receipt?.schema !== "botbound.outbound-motion-render.v1") {
    throw new Error("Outbound render provenance receipt is missing or has an unsupported schema.");
  }
  if (receipt.campaign !== "THE FIRST MOVE") {
    throw new Error("Outbound render provenance receipt has the wrong campaign identity.");
  }
  if (receipt.sourceFingerprint !== currentContext.sourceFingerprint) {
    throw new Error("Outbound motion source or renderer changed after the masters were rendered.");
  }

  const expected = OUTBOUND_SOCIAL_DELIVERIES.map(({ composition, fileName }) => ({
    composition,
    fileName,
  }));
  const actual = Array.isArray(receipt.masters)
    ? receipt.masters.map(({ composition, file }) => ({ composition, fileName: file }))
    : [];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Outbound render receipt is not the exact approved 6s/10s/15s master set.");
  }
  for (const master of receipt.masters) {
    if (!/^[0-9a-f]{64}$/.test(master.sha256 || "") || !(master.bytes > 0)) {
      throw new Error(
        `Outbound render receipt has invalid media provenance: ${master.file || "unknown"}`,
      );
    }
  }
}
