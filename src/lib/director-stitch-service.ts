/**
 * Director × Google Stitch — generate, edit, variants, and site builds for UI media.
 * Uses @google/stitch-sdk (official MCP client + domain API).
 */
import type { Screen } from "@google/stitch-sdk";
import { buildSignedDownloadUrl, buildSignedPreviewUrl } from "./director-artifact-signing";
import { storeDirectorArtifact } from "./director-artifacts";
import type { DirectorPreviewMeta } from "./director-message-metadata";
import {
  buildStitchGenerationPrompt,
  resolveStitchDeviceType,
  resolveStitchMediaOperation,
  resolveStitchModelId,
  resolveStitchVariantOptions,
  type StitchSession,
} from "./director-stitch-intent";
import { loadLatestStitchSession } from "./director-stitch-session";
import {
  extractStitchScreens,
  GoogleStitchError,
  mergeStitchScreenRecord,
  pickCompatibleStitchProject,
  extractStitchInlineHtml,
  extractStitchInlineImage,
} from "./google-stitch-mcp-client";
import { createGoogleStitchRuntime, type GoogleStitchRuntime } from "./google-stitch-sdk-client";
import {
  mapStitchError,
  projectEntityToRef,
  screenEntityToRecord,
  withStitchAbort,
} from "./google-stitch-sdk-helpers";
import { isAllowedStitchAssetHost, sanitizeStitchAssetUrl } from "./google-stitch-asset-url";
import {
  getGoogleStitchApiKey,
  getGoogleStitchProjectId,
  isGoogleStitchConfigured,
} from "./google-stitch-config";
import { WIRELINE_STITCH_UI } from "./wireline-director-design";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/** Inline data-URL in message metadata — cap size for JSONB message rows. */
const STITCH_PREVIEW_MAX_BYTES = 600_000;

export interface DirectorStitchTurnResult {
  reply: string;
  previews: DirectorPreviewMeta[];
  artifacts: Array<Record<string, unknown>>;
  stitchSession: StitchSession;
  thinkingSummary: string;
  durationMs: number;
}

export type StitchProgressCallback = (message: string) => void;

function pickDownloadUrlFromBlock(block: unknown): string | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  for (const key of ["downloadUrl", "uri", "url", "signedUrl", "signed_url"]) {
    const raw = o[key];
    if (typeof raw === "string" && raw.startsWith("http")) return raw;
  }
  for (const value of Object.values(o)) {
    const hit = pickDownloadUrlFromBlock(value);
    if (hit) return hit;
  }
  return null;
}

function pickDownloadUrl(screen: Record<string, unknown>, kind: "html" | "image"): string | null {
  if (kind === "html") {
    return (
      pickDownloadUrlFromBlock(screen.htmlCode) ||
      pickDownloadUrlFromBlock(screen.html) ||
      (typeof screen.htmlDownloadUrl === "string" ? screen.htmlDownloadUrl : null) ||
      (typeof screen.htmlUrl === "string" ? screen.htmlUrl : null)
    );
  }
  return (
    pickDownloadUrlFromBlock(screen.screenshot) ||
    pickDownloadUrlFromBlock(screen.image) ||
    (typeof screen.imageDownloadUrl === "string" ? screen.imageDownloadUrl : null) ||
    (typeof screen.screenshotUrl === "string" ? screen.screenshotUrl : null)
  );
}

async function fetchRemoteAsset(url: string, signal?: AbortSignal): Promise<Buffer> {
  const host = new URL(url).hostname;
  if (!isAllowedStitchAssetHost(host)) {
    throw new GoogleStitchError(`Refusing non-Google asset host: ${host}`, "VALIDATION_ERROR");
  }
  const apiKey = getGoogleStitchApiKey();
  const headers: Record<string, string> = {};
  if (apiKey && /stitch|googleapis|withgoogle/i.test(host)) {
    headers["X-Goog-Api-Key"] = apiKey;
  }
  const res = await fetch(url, { signal, headers });
  if (!res.ok) {
    throw new GoogleStitchError(`Asset download failed (${res.status})`, "NETWORK_ERROR", true);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function fetchScreenAssets(
  screen: Screen,
  signal?: AbortSignal,
): Promise<{ html?: Buffer; image?: Buffer; screen: Record<string, unknown> }> {
  let screenRecord = screenEntityToRecord(screen);
  let html = extractStitchInlineHtml(screenRecord);
  let image = extractStitchInlineImage(screenRecord);

  const [htmlUrl, imageUrl] = await Promise.all([
    withStitchAbort(signal, () => screen.getHtml()).catch((e) => {
      log.warn("stitch getHtml failed", {
        screenId: screen.screenId,
        error: getErrorMessage(e),
      });
      return "";
    }),
    withStitchAbort(signal, () => screen.getImage()).catch((e) => {
      log.warn("stitch getImage failed", {
        screenId: screen.screenId,
        error: getErrorMessage(e),
      });
      return "";
    }),
  ]);

  const safeHtmlUrl = sanitizeStitchAssetUrl(htmlUrl);
  const safeImageUrl = sanitizeStitchAssetUrl(imageUrl);
  if (htmlUrl && !safeHtmlUrl) {
    log.warn("stitch html url blocked", { screenId: screen.screenId });
  }
  if (imageUrl && !safeImageUrl) {
    log.warn("stitch image url blocked", { screenId: screen.screenId });
  }
  if (safeHtmlUrl) {
    screenRecord = mergeStitchScreenRecord(screenRecord, {
      htmlCode: { downloadUrl: safeHtmlUrl },
    });
  }
  if (safeImageUrl) {
    screenRecord = mergeStitchScreenRecord(screenRecord, {
      screenshot: { downloadUrl: safeImageUrl },
    });
  }

  html = html ?? extractStitchInlineHtml(screenRecord);
  image = image ?? extractStitchInlineImage(screenRecord);

  const resolvedHtmlUrl = pickDownloadUrl(screenRecord, "html");
  const resolvedImageUrl = pickDownloadUrl(screenRecord, "image");

  const [htmlPacked, imagePacked] = await Promise.all([
    (async (): Promise<Buffer | undefined> => {
      if (html) return html;
      if (!resolvedHtmlUrl) return undefined;
      return fetchRemoteAsset(resolvedHtmlUrl, signal).catch((e) => {
        log.warn("stitch html download failed", {
          screenId: screen.screenId,
          error: getErrorMessage(e),
        });
        return undefined;
      });
    })(),
    (async (): Promise<Buffer | undefined> => {
      if (image) return image;
      if (!resolvedImageUrl) return undefined;
      return fetchRemoteAsset(resolvedImageUrl, signal).catch((e) => {
        log.warn("stitch image download failed", {
          screenId: screen.screenId,
          error: getErrorMessage(e),
        });
        return undefined;
      });
    })(),
  ]);

  return { html: htmlPacked, image: imagePacked, screen: screenRecord };
}

/** Stitch screenshot/HTML can lag the screen record — poll until at least one asset is ready. */
async function fetchScreenAssetsWithRetry(
  screen: Screen,
  signal?: AbortSignal,
): Promise<{ html?: Buffer; image?: Buffer; screen: Record<string, unknown> }> {
  const delaysMs = [
    0, 4_000, 8_000, 12_000, 18_000, 24_000, 32_000, 40_000, 50_000, 60_000, 72_000, 84_000, 96_000,
    110_000, 125_000, 140_000, 155_000, 170_000, 185_000, 200_000,
  ];
  let last = await fetchScreenAssets(screen, signal);
  for (let i = 1; i < delaysMs.length; i++) {
    if (last.html || last.image) return last;
    await sleepMs(delaysMs[i]! - delaysMs[i - 1]!, signal);
    last = await fetchScreenAssets(screen, signal);
  }
  return last;
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GoogleStitchError("Stitch request aborted", "NETWORK_ERROR", true));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new GoogleStitchError("Stitch request aborted", "NETWORK_ERROR", true));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function listStitchScreens(
  runtime: GoogleStitchRuntime,
  projectId: string,
  signal?: AbortSignal,
): Promise<Screen[]> {
  const project = runtime.stitch.project(projectId);
  try {
    return await withStitchAbort(signal, () => project.screens());
  } catch (e) {
    log.warn("stitch list screens failed", { projectId, error: getErrorMessage(e) });
    return [];
  }
}

function pickNewestStitchScreens(screens: Screen[], knownScreenIds: Set<string>): Screen[] {
  const fresh = screens.filter((s) => s.screenId && !knownScreenIds.has(s.screenId));
  const pool = fresh.length > 0 ? fresh : screens;
  return [...pool].sort((a, b) => {
    const aRecord = screenEntityToRecord(a);
    const bRecord = screenEntityToRecord(b);
    const aTime = String(aRecord.updateTime ?? aRecord.createTime ?? "");
    const bTime = String(bRecord.updateTime ?? bRecord.createTime ?? "");
    if (aTime && bTime) return bTime.localeCompare(aTime);
    const aNum = Number(a.screenId);
    const bNum = Number(b.screenId);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) return bNum - aNum;
    return 0;
  });
}

async function ensureStitchProject(
  runtime: GoogleStitchRuntime,
  session: StitchSession | null,
  onProgress?: StitchProgressCallback,
  signal?: AbortSignal,
): Promise<StitchSession> {
  if (session?.projectId) return session;

  const envProjectId = getGoogleStitchProjectId();
  if (envProjectId) {
    return { projectId: envProjectId, screenId: "", projectTitle: "Wireline Director" };
  }

  onProgress?.("Loading Stitch projects…");
  const projects = await withStitchAbort(signal, () => runtime.stitch.projects());
  const picked = pickCompatibleStitchProject(projects.map(projectEntityToRef));
  if (picked) {
    return {
      projectId: picked.projectId,
      screenId: "",
      projectTitle: picked.title || "Wireline Director",
    };
  }

  throw new GoogleStitchError(
    "No Stitch project available for UI generation. Create a project at stitch.withgoogle.com (TEXT_TO_UI), then set GOOGLE_STITCH_PROJECT_ID in Vercel.",
    "VALIDATION_ERROR",
  );
}

async function runStitchOperation(
  runtime: GoogleStitchRuntime,
  input: {
    operation: ReturnType<typeof resolveStitchMediaOperation>;
    projectId: string;
    screenId?: string;
    prompt: string;
    deviceType: ReturnType<typeof resolveStitchDeviceType>;
    modelId: ReturnType<typeof resolveStitchModelId>;
    operatorMessage: string;
  },
  onProgress?: StitchProgressCallback,
  signal?: AbortSignal,
): Promise<Screen[]> {
  const { operation, projectId, screenId, prompt, deviceType, modelId } = input;
  const project = runtime.stitch.project(projectId);

  if (operation === "variants") {
    if (!screenId) {
      throw new GoogleStitchError(
        "No Stitch screen to variant — generate a screen first.",
        "VALIDATION_ERROR",
      );
    }
    onProgress?.("Generating Stitch design variants…");
    const opts = resolveStitchVariantOptions(input.operatorMessage);
    const variants = await withStitchAbort(signal, () =>
      project.screen(screenId).variants(prompt, opts, deviceType, modelId),
    );
    if (variants.length === 0) {
      throw new GoogleStitchError("Stitch returned no variants", "VALIDATION_ERROR", true);
    }
    return variants;
  }

  if (operation === "edit") {
    if (!screenId) {
      throw new GoogleStitchError(
        "No Stitch screen to edit — generate a screen first.",
        "VALIDATION_ERROR",
      );
    }
    onProgress?.("Editing Stitch screen…");
    const updated = await withStitchAbort(signal, () =>
      project.screen(screenId).edit(prompt, deviceType, modelId),
    );
    return [updated];
  }

  if (operation === "build_site") {
    onProgress?.("Building multi-page site in Stitch…");
    try {
      const built = await withStitchAbort(signal, () =>
        runtime.client.callTool<unknown>("build_site", {
          projectId,
          prompt,
          deviceType,
          modelId,
        }),
      );
      const screens = extractStitchScreens(built)
        .filter((record) => String(record.screenId ?? "").trim())
        .map((record) =>
          runtime.stitch
            .project(String(record.projectId ?? projectId))
            .screen(String(record.screenId)),
        );
      if (screens.length > 0) return screens;
    } catch (e) {
      log.warn("stitch build_site unavailable, falling back to generate", {
        error: getErrorMessage(e),
      });
    }
  }

  const knownBefore = new Set(
    (await listStitchScreens(runtime, projectId, signal)).map((s) => s.screenId),
  );

  onProgress?.("Generating Wireline Design screen (3–5 min)…");
  let generated: Screen | null = null;
  try {
    generated = await withStitchAbort(signal, () => project.generate(prompt, deviceType, modelId));
  } catch (e) {
    log.warn("stitch generate ended early — polling screens", {
      error: getErrorMessage(e),
    });
  }

  if (generated?.screenId) return [generated];

  onProgress?.("Waiting for Wireline Design to finish composing…");
  for (let attempt = 0; attempt < 12; attempt++) {
    await sleepMs(attempt === 0 ? 5_000 : 6_000, signal);
    const listed = await listStitchScreens(runtime, projectId, signal);
    const screens = pickNewestStitchScreens(listed, knownBefore);
    if (screens.length > 0) return screens.slice(0, 5);
    onProgress?.(`Still composing… (${attempt + 1}/12)`);
  }

  throw new GoogleStitchError("Stitch returned no screens", "VALIDATION_ERROR", true);
}

function buildStitchReply(
  operation: ReturnType<typeof resolveStitchMediaOperation>,
  screenCount: number,
  deviceType: string,
): string {
  const opLabel =
    operation === "variants"
      ? `${screenCount} design variant${screenCount === 1 ? "" : "s"}`
      : operation === "edit"
        ? "updated screen"
        : operation === "build_site"
          ? "multi-page site build"
          : "UI screen";
  return [
    `I built your **${opLabel}** (${deviceType.toLowerCase()}).`,
    "",
    "**Included**",
    "- Live preview in this thread",
    "- Downloadable HTML/CSS prototype in artifacts",
    "",
    "**What you can ask next**",
    "- “Make the hero darker” or “add a booking CTA”",
    "- “Show 3 color variants”",
    "- “Build out the full multi-page site”",
    "",
    "Describe changes in plain language — no capability chip required.",
  ].join("\n");
}

export async function runDirectorStitchTurn(input: {
  userId: string;
  operatorMessage: string;
  businessName?: string;
  onProgress?: StitchProgressCallback;
  signal?: AbortSignal;
}): Promise<DirectorStitchTurnResult> {
  if (!isGoogleStitchConfigured()) {
    throw new GoogleStitchError("Google Stitch is not configured", "AUTH_FAILED");
  }

  const t0 = Date.now();
  const runtime = createGoogleStitchRuntime();

  try {
    const priorSession = await loadLatestStitchSession(input.userId);
    const operation = resolveStitchMediaOperation(input.operatorMessage, priorSession);
    const deviceType = resolveStitchDeviceType(input.operatorMessage);
    const modelId = resolveStitchModelId(input.operatorMessage);
    const prompt = buildStitchGenerationPrompt(input.operatorMessage, input.businessName);

    const project = await ensureStitchProject(
      runtime,
      priorSession,
      input.onProgress,
      input.signal,
    );

    const screens = await runStitchOperation(
      runtime,
      {
        operation,
        projectId: project.projectId,
        screenId: priorSession?.screenId,
        prompt,
        deviceType,
        modelId,
        operatorMessage: input.operatorMessage,
      },
      input.onProgress,
      input.signal,
    );

    if (screens.length === 0) {
      throw new GoogleStitchError("No Stitch screens produced", "VALIDATION_ERROR", true);
    }

    const previews: DirectorPreviewMeta[] = [];
    const artifacts: Array<Record<string, unknown>> = [];
    const thinkingLines: string[] = [];

    for (let i = 0; i < screens.length; i++) {
      const screen = screens[i]!;
      const screenId = screen.screenId;
      const projectId = screen.projectId || project.projectId;
      if (!screenId) continue;

      input.onProgress?.(`Downloading assets for screen ${i + 1}/${screens.length}…`);
      const assets = await fetchScreenAssetsWithRetry(screen, input.signal);

      const stamp = new Date().toISOString().slice(0, 10);
      const suffix = screens.length > 1 ? `-v${i + 1}` : "";

      const title =
        screens.length > 1
          ? `Variant ${i + 1}`
          : deviceType === "MOBILE"
            ? "Mobile screen"
            : "Screen";
      let htmlDownloadUrl: string | undefined;
      let imageDownloadUrl: string | undefined;
      let htmlArtifactId: string | undefined;
      let imageArtifactId: string | undefined;
      let previewDataUrl = "";

      if (assets.html) {
        const saved = await storeDirectorArtifact({
          userId: input.userId,
          toolName: "google_stitch",
          artifactType: "stitch-html",
          name: `stitch-${stamp}${suffix}.html`,
          mimeType: "text/html; charset=utf-8",
          data: assets.html,
          metadata: {
            operatorPreview: input.operatorMessage.trim().slice(0, 120),
            stitchProjectId: projectId,
            stitchScreenId: screenId,
            deviceType,
          },
        });
        htmlArtifactId = saved.id;
        htmlDownloadUrl = buildSignedPreviewUrl("/api/director/artifacts", saved.id, input.userId);
        artifacts.push({
          ...saved,
          downloadUrl: buildSignedDownloadUrl("/api/director/artifacts", saved.id, input.userId),
        });
      }

      if (assets.image) {
        const saved = await storeDirectorArtifact({
          userId: input.userId,
          toolName: "google_stitch",
          artifactType: "stitch-screenshot",
          name: `stitch-${stamp}${suffix}.png`,
          mimeType: "image/png",
          data: assets.image,
          metadata: {
            operatorPreview: input.operatorMessage.trim().slice(0, 120),
            stitchProjectId: projectId,
            stitchScreenId: screenId,
            deviceType,
          },
        });
        imageArtifactId = saved.id;
        imageDownloadUrl = buildSignedPreviewUrl("/api/director/artifacts", saved.id, input.userId);
        artifacts.push({
          ...saved,
          downloadUrl: buildSignedDownloadUrl("/api/director/artifacts", saved.id, input.userId),
        });
        previewDataUrl =
          assets.image.byteLength <= STITCH_PREVIEW_MAX_BYTES
            ? `data:image/png;base64,${assets.image.toString("base64")}`
            : imageDownloadUrl;
      }

      if (!htmlArtifactId && !imageArtifactId) {
        log.warn("stitch screen skipped — no packaged assets", { screenId, projectId, deviceType });
        continue;
      }

      previews.push({
        conceptId: screenId,
        title,
        rationale: WIRELINE_STITCH_UI.modelLabel,
        kind: "stitch",
        deviceType,
        previewDataUrl: previewDataUrl || imageDownloadUrl || htmlDownloadUrl || "",
        htmlDownloadUrl,
        imageDownloadUrl,
        htmlArtifactId,
        imageArtifactId,
      });

      thinkingLines.push(`Screen ${screenId} (${deviceType})`);
    }

    if (previews.length === 0) {
      throw new GoogleStitchError(
        "Wireline Design composed a screen but preview assets were not ready. Try again.",
        "VALIDATION_ERROR",
        true,
      );
    }

    const primary = screens[0]!;
    const stitchSession: StitchSession = {
      projectId: primary.projectId || project.projectId,
      screenId: primary.screenId,
      projectTitle: project.projectTitle,
    };

    const durationMs = Date.now() - t0;
    return {
      reply: buildStitchReply(operation, screens.length, deviceType),
      previews,
      artifacts,
      stitchSession,
      thinkingSummary: thinkingLines.join(" · "),
      durationMs,
    };
  } catch (e) {
    throw mapStitchError(e);
  } finally {
    await runtime.close().catch(() => undefined);
  }
}

/** Non-throwing entry — returns null so Director can fall back to Claude. */
export async function tryDirectorStitchTurn(
  input: Parameters<typeof runDirectorStitchTurn>[0],
): Promise<DirectorStitchTurnResult | null> {
  if (!isGoogleStitchConfigured()) return null;
  try {
    return await runDirectorStitchTurn(input);
  } catch (e) {
    log.warn("director stitch turn failed — falling back to LLM", {
      userId: input.userId,
      error: getErrorMessage(e),
      code: e instanceof GoogleStitchError ? e.code : undefined,
    });
    return null;
  }
}
