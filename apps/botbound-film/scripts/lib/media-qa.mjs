import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

function linuxLibc() {
  if (process.platform !== "linux") return null;
  const report = process.report?.getReport?.();
  return report?.header?.glibcVersionRuntime ? "gnu" : "musl";
}

function compositorPackage() {
  if (process.platform === "win32" && process.arch === "x64") {
    return "@remotion/compositor-win32-x64-msvc";
  }
  if (process.platform === "darwin" && ["x64", "arm64"].includes(process.arch)) {
    return `@remotion/compositor-darwin-${process.arch}`;
  }
  if (process.platform === "linux" && ["x64", "arm64"].includes(process.arch)) {
    return `@remotion/compositor-linux-${process.arch}-${linuxLibc()}`;
  }
  throw new Error(`Unsupported Remotion compositor platform: ${process.platform}/${process.arch}`);
}

function packageDirectories(projectDirectory, packageName) {
  const scopeName = packageName.replace("@remotion/", "");
  const nodeModules = join(projectDirectory, "node_modules");
  const direct = join(nodeModules, "@remotion", scopeName);
  const pnpmRoot = join(nodeModules, ".pnpm");
  const pnpm = existsSync(pnpmRoot)
    ? readdirSync(pnpmRoot)
        .filter((entry) => entry.startsWith(`@remotion+${scopeName}@`))
        .map((entry) => join(pnpmRoot, entry, "node_modules", "@remotion", scopeName))
    : [];
  return [direct, ...pnpm];
}

/** Resolve Remotion's platform compositor after either npm or pnpm install. */
export function resolveMediaTools(projectDirectory) {
  const configuredFfmpeg = process.env.BOTBOUND_FFMPEG_PATH?.trim();
  const configuredFfprobe = process.env.BOTBOUND_FFPROBE_PATH?.trim();
  if (Boolean(configuredFfmpeg) !== Boolean(configuredFfprobe)) {
    throw new Error("Set BOTBOUND_FFMPEG_PATH and BOTBOUND_FFPROBE_PATH together.");
  }
  if (configuredFfmpeg && configuredFfprobe) {
    if (!existsSync(configuredFfmpeg) || !existsSync(configuredFfprobe)) {
      throw new Error("Configured ffmpeg/ffprobe path does not exist.");
    }
    const configured = { ffmpeg: configuredFfmpeg, ffprobe: configuredFfprobe };
    assertMediaToolsExecutable(configured);
    return configured;
  }

  const executable = (name) => `${name}${process.platform === "win32" ? ".exe" : ""}`;
  for (const directory of packageDirectories(projectDirectory, compositorPackage())) {
    const ffmpeg = join(directory, executable("ffmpeg"));
    const ffprobe = join(directory, executable("ffprobe"));
    if (existsSync(ffmpeg) && existsSync(ffprobe)) {
      const packaged = { ffmpeg, ffprobe };
      assertMediaToolsExecutable(packaged);
      return packaged;
    }
  }

  // A system installation is a supported final fallback. Validate it here so
  // path/layout problems fail before any approval artifacts are touched.
  const fallback = { ffmpeg: executable("ffmpeg"), ffprobe: executable("ffprobe") };
  assertMediaToolsExecutable(fallback);
  return fallback;
}

function assertMediaToolsExecutable(tools) {
  for (const [name, command] of Object.entries(tools)) {
    const result = spawnSync(command, ["-version"], { encoding: "utf8" });
    if (result.status !== 0) {
      const detail =
        result.error?.message || result.stderr || result.stdout || `exit ${result.status}`;
      throw new Error(
        `Remotion ${name} binary is unavailable for ${process.platform}/${process.arch}: ${detail}`,
      );
    }
  }
}

function frameRate(value) {
  const [numerator, denominator] = String(value || "")
    .split("/")
    .map(Number);
  return denominator > 0 ? numerator / denominator : Number(value);
}

export function assertMediaDelivery(probe, delivery) {
  const failures = [];
  const videoStreams = probe.streams.filter((stream) => stream.codec_type === "video");
  const audioStreams = probe.streams.filter((stream) => stream.codec_type === "audio");
  const video = videoStreams[0];
  const audio = audioStreams[0];
  const duration = Number(probe.format?.duration);
  const videoDuration = Number(video?.duration);
  const audioDuration = Number(audio?.duration);
  const expectedFrames = delivery.durationSeconds * 30;

  if (videoStreams.length !== 1)
    failures.push(`expected one video stream, found ${videoStreams.length}`);
  if (audioStreams.length !== 1)
    failures.push(`expected one audio stream, found ${audioStreams.length}`);
  if (
    !String(probe.format?.format_name || "")
      .split(",")
      .includes("mp4")
  ) {
    failures.push(`container ${probe.format?.format_name || "missing"} is not MP4`);
  }
  if (video?.codec_name !== "h264")
    failures.push(`video codec ${video?.codec_name || "missing"} is not h264`);
  if (video?.width !== delivery.width || video?.height !== delivery.height) {
    failures.push(
      `frame ${video?.width || 0}x${video?.height || 0} is not ${delivery.width}x${delivery.height}`,
    );
  }
  for (const field of ["r_frame_rate", "avg_frame_rate"]) {
    const rate = frameRate(video?.[field]);
    if (!Number.isFinite(rate) || Math.abs(rate - 30) > 0.001) {
      failures.push(`${field} ${video?.[field] || "missing"} is not 30 fps`);
    }
  }
  if (Number(video?.nb_frames) !== expectedFrames)
    failures.push(`frame count ${video?.nb_frames || "missing"} is not ${expectedFrames}`);
  if (video?.pix_fmt !== "yuv420p")
    failures.push(`pixel format ${video?.pix_fmt || "missing"} is not yuv420p`);
  if (delivery.colorSpace && video?.color_space !== delivery.colorSpace) {
    failures.push(`color space ${video?.color_space || "missing"} is not ${delivery.colorSpace}`);
  }
  if (audio?.codec_name !== "aac")
    failures.push(`audio codec ${audio?.codec_name || "missing"} is not aac`);
  if (Number(audio?.sample_rate) !== 48_000)
    failures.push(`audio sample rate ${audio?.sample_rate || "missing"} is not 48000`);
  if (audio?.channels !== 2) failures.push(`audio channels ${audio?.channels || 0} is not stereo`);
  if (audio?.channel_layout !== "stereo")
    failures.push(`audio layout ${audio?.channel_layout || "missing"} is not stereo`);
  if (
    !Number.isFinite(videoDuration) ||
    Math.abs(videoDuration - delivery.durationSeconds) > 1 / 30 + 0.001
  ) {
    failures.push(
      `video duration ${video?.duration || "missing"} is outside one frame of ${delivery.durationSeconds}s`,
    );
  }
  if (!Number.isFinite(audioDuration) || Math.abs(audioDuration - delivery.durationSeconds) > 0.1) {
    failures.push(
      `audio duration ${audio?.duration || "missing"} is outside ${delivery.durationSeconds}s ±0.1s`,
    );
  }
  if (!Number.isFinite(duration) || Math.abs(duration - delivery.durationSeconds) > 0.1) {
    failures.push(
      `container duration ${probe.format?.duration || "missing"} is outside ${delivery.durationSeconds}s ±0.1s`,
    );
  }
  if (!(Number(probe.format?.size) > 0)) failures.push("container size is missing or empty");

  if (failures.length) {
    throw new Error(`${delivery.stem}.mp4 failed delivery QA: ${failures.join("; ")}`);
  }
  return { video, audio, duration };
}

export function assertExactMasterSet(outputDirectory, deliveries) {
  const actual = readdirSync(outputDirectory)
    .filter((name) => name.toLowerCase().endsWith(".mp4"))
    .sort();
  const expected = deliveries.map(({ stem }) => `${stem}.mp4`).sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expected.includes(name));
  if (missing.length || unexpected.length) {
    throw new Error(
      `Motion master set is not exact${missing.length ? `; missing: ${missing.join(", ")}` : ""}${unexpected.length ? `; unexpected: ${unexpected.join(", ")}` : ""}`,
    );
  }
}
