/**
 * Director × Google Stitch — generate, edit, variants, and site builds for UI media.
 * Uses @google/stitch-sdk (official MCP client + domain API).
 */
import { randomUUID } from "node:crypto";
import type { Screen } from "@google/stitch-sdk";
import { buildSignedDownloadUrl, buildSignedPreviewUrl } from "./director-artifact-signing";
import { storeDirectorArtifact } from "./director-artifacts";
import type { DirectorPreviewMeta } from "./director-message-metadata";
import {
  buildStitchClarifyReply,
  buildStitchDesignBriefArtifact,
  buildStitchDesignMarkdown,
  loadStitchTenantBranding,
  missingStitchBriefFields,
  parseStitchDesignBrief,
  resolveUseAccountBranding,
  stitchClarifyingQuestions,
  type StitchBriefOptions,
} from "./director-stitch-brief";
import {
  buildStitchGenerationPrompt,
  resolveEffectiveStitchDeviceType,
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
  isLikelyStitchPlaceholderImage,
  stitchScreenAssetsReady,
} from "./google-stitch-mcp-client";
import { createGoogleStitchRuntime, type GoogleStitchRuntime } from "./google-stitch-sdk-client";
import {
  mapStitchError,
  projectEntityToRef,
  screenEntityToRecord,
  withStitchAbort,
} from "./google-stitch-sdk-helpers";
import {
  isAllowedStitchAssetHost,
  fetchStitchAssetUrl,
  sanitizeStitchAssetUrl,
} from "./google-stitch-asset-url";
import {
  getGoogleStitchProjectId,
  getStitchFinalizePollDelaysMs,
  getStitchInRequestAssetPollDelaysMs,
  getStitchInRequestDeadlineMs,
  getStitchScreenDiscoveryPollDelaysMs,
  STITCH_IN_REQUEST_ASSET_POLL_MS,
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
  stitchSession?: StitchSession;
  /** Screen composed in Stitch but HTML/PNG still packaging — client should call finalize. */
  stitchAssetsPending?: boolean;
  thinkingSummary: string;
  durationMs: number;
  clarifyingQuestions?: string[];
  designBriefMarkdown?: string;
}

export type StitchProgressCallback = (message: string) => void;

export interface DirectorStitchTurnInput {
  userId: string;
  operatorMessage: string;
  businessName?: string;
  history?: Array<{ role: "operator" | "director"; content: string }>;
  stitchOptions?: StitchBriefOptions;
  onProgress?: StitchProgressCallback;
  signal?: AbortSignal;
}

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

/** Keep generate-time asset URLs when a later get_screen poll has not packaged yet. */
function mergeStitchScreenAssetFields(
  seed: Record<string, unknown>,
  fresh: Record<string, unknown>,
): Record<string, unknown> {
  const merged = mergeStitchScreenRecord(seed, fresh);
  for (const field of ["htmlCode", "html", "screenshot", "image"] as const) {
    const freshBlock = fresh[field];
    const seedBlock = seed[field];
    if (!pickDownloadUrlFromBlock(freshBlock) && pickDownloadUrlFromBlock(seedBlock)) {
      merged[field] = seedBlock;
    }
  }
  return merged;
}

async function fetchRemoteAsset(url: string, signal?: AbortSignal): Promise<Buffer> {
  const host = new URL(url).hostname;
  if (!isAllowedStitchAssetHost(host)) {
    throw new GoogleStitchError(`Refusing non-Google asset host: ${host}`, "VALIDATION_ERROR");
  }
  try {
    return await fetchStitchAssetUrl(url, signal);
  } catch (e) {
    throw new GoogleStitchError(getErrorMessage(e), "NETWORK_ERROR", true);
  }
}

async function fetchScreenAssets(
  runtime: GoogleStitchRuntime,
  screen: Screen,
  signal?: AbortSignal,
): Promise<{ html?: Buffer; image?: Buffer; screen: Record<string, unknown> }> {
  const seedRecord = screenEntityToRecord(screen);
  let activeScreen = screen;
  let screenRecord = seedRecord;
  if (screen.screenId && screen.projectId) {
    try {
      activeScreen = await withStitchAbort(signal, () =>
        runtime.stitch.project(screen.projectId).getScreen(screen.screenId),
      );
      const freshRecord = screenEntityToRecord(activeScreen);
      const raw = await withStitchAbort(signal, () =>
        runtime.client.callTool<unknown>("get_screen", {
          projectId: screen.projectId,
          screenId: screen.screenId,
          name: `projects/${screen.projectId}/screens/${screen.screenId}`,
        }),
      );
      screenRecord = mergeStitchScreenAssetFields(
        seedRecord,
        mergeStitchScreenRecord(freshRecord, raw),
      );
    } catch (e) {
      log.warn("stitch getScreen refresh failed", {
        screenId: screen.screenId,
        projectId: screen.projectId,
        error: getErrorMessage(e),
      });
    }
  }

  let html = extractStitchInlineHtml(screenRecord);
  let image = extractStitchInlineImage(screenRecord);

  const [htmlUrl, imageUrl] = await Promise.all([
    withStitchAbort(signal, () => activeScreen.getHtml()).catch((e) => {
      log.warn("stitch getHtml failed", {
        screenId: activeScreen.screenId,
        error: getErrorMessage(e),
      });
      return "";
    }),
    withStitchAbort(signal, () => activeScreen.getImage()).catch((e) => {
      log.warn("stitch getImage failed", {
        screenId: activeScreen.screenId,
        error: getErrorMessage(e),
      });
      return "";
    }),
  ]);

  const safeHtmlUrl = sanitizeStitchAssetUrl(htmlUrl);
  const safeImageUrl = sanitizeStitchAssetUrl(imageUrl);
  if (htmlUrl && !safeHtmlUrl) {
    log.warn("stitch html url blocked", { screenId: activeScreen.screenId });
  }
  if (imageUrl && !safeImageUrl) {
    log.warn("stitch image url blocked", { screenId: activeScreen.screenId });
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
          screenId: activeScreen.screenId,
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
          screenId: activeScreen.screenId,
          error: getErrorMessage(e),
        });
        return undefined;
      });
    })(),
  ]);

  return { html: htmlPacked, image: imagePacked, screen: screenRecord };
}

/** Stitch screenshot/HTML can lag the screen record — poll until polished assets are ready. */
async function fetchScreenAssetsWithRetry(
  runtime: GoogleStitchRuntime,
  screen: Screen,
  signal?: AbortSignal,
  options: {
    context?: "in-request" | "finalize";
    pollDelaysMs?: number[];
  } = {},
): Promise<{ html?: Buffer; image?: Buffer; screen: Record<string, unknown> }> {
  const delaysMs =
    options.pollDelaysMs ??
    (options.context === "finalize"
      ? getStitchFinalizePollDelaysMs()
      : getStitchInRequestAssetPollDelaysMs());
  let last = await fetchScreenAssets(runtime, screen, signal);
  for (let i = 1; i < delaysMs.length; i++) {
    const finalAttempt = i === delaysMs.length - 1;
    if (stitchScreenAssetsReady(last, { allowImageFallback: finalAttempt })) {
      return last;
    }
    await sleepMs(delaysMs[i]! - delaysMs[i - 1]!, signal);
    last = await fetchScreenAssets(runtime, screen, signal);
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
    const err = mapStitchError(e);
    if (err.code === "AUTH_FAILED" || err.code === "PERMISSION_DENIED") {
      throw err;
    }
    log.warn("stitch list screens failed", {
      projectId,
      error: getErrorMessage(e),
      code: err.code,
    });
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
    return { projectId: envProjectId, screenId: "", projectTitle: "Client designs" };
  }

  onProgress?.("Loading Stitch projects…");
  const projects = await withStitchAbort(signal, () => runtime.stitch.projects());
  const picked = pickCompatibleStitchProject(projects.map(projectEntityToRef));
  if (picked) {
    return {
      projectId: picked.projectId,
      screenId: "",
      projectTitle: picked.title || "Client designs",
    };
  }

  throw new GoogleStitchError(
    "No Stitch project available for UI generation. Create a project at stitch.withgoogle.com (TEXT_TO_UI), then set GOOGLE_STITCH_PROJECT_ID in Vercel.",
    "VALIDATION_ERROR",
    true,
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
  requestDeadlineMs?: number,
): Promise<Screen[]> {
  const { operation, projectId, screenId, prompt, deviceType, modelId } = input;
  const remainingBeforeAssetPoll = () =>
    requestDeadlineMs !== undefined
      ? Math.max(0, requestDeadlineMs - Date.now() - STITCH_IN_REQUEST_ASSET_POLL_MS - 15_000)
      : 180_000;
  const project = runtime.stitch.project(projectId);

  if (operation === "variants") {
    if (!screenId) {
      throw new GoogleStitchError(
        "No Stitch screen to variant — generate a screen first.",
        "VALIDATION_ERROR",
      );
    }
    onProgress?.("Generating Stitch design variants…");
    // SDK 0.3.5 declares `VariantOptions.aspects` with missing parens — the union
    // widens to either a single literal OR `"TEXT_CONTENT"[]`, instead of the
    // intended `(union)[]`. The runtime accepts a mixed-aspect array, so we cast
    // through `unknown` at the call site to bypass the upstream typing bug.
    const opts = resolveStitchVariantOptions(input.operatorMessage);
    const variants = await withStitchAbort(signal, () =>
      project
        .screen(screenId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type bug (see comment above)
        .variants(prompt, opts as any, deviceType, modelId),
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
  const pollDelays = getStitchScreenDiscoveryPollDelaysMs(remainingBeforeAssetPoll());
  const pollAttempts = Math.max(1, pollDelays.length - 1);
  for (let attempt = 1; attempt < pollDelays.length; attempt++) {
    await sleepMs(pollDelays[attempt]! - pollDelays[attempt - 1]!, signal);
    const listed = await listStitchScreens(runtime, projectId, signal);
    const screens = pickNewestStitchScreens(listed, knownBefore);
    if (screens.length > 0) return [screens[0]!];
    onProgress?.(`Still composing… (${attempt}/${pollAttempts})`);
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

interface PackageStitchScreenInput {
  userId: string;
  operatorMessage: string;
  screenId: string;
  projectId: string;
  deviceType: ReturnType<typeof resolveStitchDeviceType>;
  renderId: string;
  assets: { html?: Buffer; image?: Buffer };
  title: string;
  artifactSuffix: string;
}

async function packageStitchScreenAssets(
  input: PackageStitchScreenInput,
): Promise<{ preview?: DirectorPreviewMeta; artifacts: Array<Record<string, unknown>> }> {
  const artifacts: Array<Record<string, unknown>> = [];
  const stamp = new Date().toISOString().slice(0, 10);
  const { screenId, projectId, deviceType, renderId, assets, title, artifactSuffix } = input;

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
      name: `stitch-${stamp}${artifactSuffix}.html`,
      mimeType: "text/html; charset=utf-8",
      data: assets.html,
      metadata: {
        operatorPreview: input.operatorMessage.trim().slice(0, 120),
        stitchProjectId: projectId,
        stitchScreenId: screenId,
        deviceType,
        stitchRenderId: renderId,
      },
    });
    htmlArtifactId = saved.id;
    htmlDownloadUrl = buildSignedPreviewUrl("/api/director/artifacts", saved.id, input.userId);
    artifacts.push({
      ...saved,
      downloadUrl: buildSignedDownloadUrl("/api/director/artifacts", saved.id, input.userId),
    });
  }

  const imageIsPlaceholder =
    assets.image !== undefined && isLikelyStitchPlaceholderImage(assets.image);

  if (
    assets.image &&
    !isLikelyStitchPlaceholderImage(assets.image) &&
    !(assets.html && imageIsPlaceholder)
  ) {
    const saved = await storeDirectorArtifact({
      userId: input.userId,
      toolName: "google_stitch",
      artifactType: "stitch-screenshot",
      name: `stitch-${stamp}${artifactSuffix}.png`,
      mimeType: "image/png",
      data: assets.image,
      metadata: {
        operatorPreview: input.operatorMessage.trim().slice(0, 120),
        stitchProjectId: projectId,
        stitchScreenId: screenId,
        deviceType,
        stitchRenderId: renderId,
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

  if (
    !stitchScreenAssetsReady(
      { html: assets.html, image: assets.image },
      { allowImageFallback: true },
    )
  ) {
    log.warn("stitch screen skipped — only placeholder assets", {
      screenId,
      projectId,
      deviceType,
      htmlBytes: assets.html?.byteLength ?? 0,
      imageBytes: assets.image?.byteLength ?? 0,
    });
    return { artifacts };
  }

  if (!htmlArtifactId && !imageArtifactId) {
    log.warn("stitch screen skipped — no packaged assets", { screenId, projectId, deviceType });
    return { artifacts };
  }

  return {
    preview: {
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
      renderId,
    },
    artifacts,
  };
}

/** Poll Stitch for HTML/PNG and package director artifacts (used after pending renders). */
export async function finalizeDirectorStitchScreen(input: {
  userId: string;
  projectId: string;
  screenId: string;
  operatorMessage: string;
  deviceType?: ReturnType<typeof resolveStitchDeviceType>;
  renderId?: string;
  signal?: AbortSignal;
}): Promise<{ previews: DirectorPreviewMeta[]; artifacts: Array<Record<string, unknown>> } | null> {
  if (!isGoogleStitchConfigured()) return null;

  const runtime = await createGoogleStitchRuntime();
  try {
    const deviceType = input.deviceType ?? resolveStitchDeviceType(input.operatorMessage);
    const screen = runtime.stitch.project(input.projectId).screen(input.screenId);
    const assets = await fetchScreenAssetsWithRetry(runtime, screen, input.signal, {
      context: "finalize",
    });
    const packaged = await packageStitchScreenAssets({
      userId: input.userId,
      operatorMessage: input.operatorMessage,
      screenId: input.screenId,
      projectId: input.projectId,
      deviceType,
      renderId: input.renderId ?? `${input.projectId}:${input.screenId}`,
      assets,
      title: deviceType === "MOBILE" ? "Mobile screen" : "Screen",
      artifactSuffix: "",
    });
    if (!packaged.preview) return null;
    return { previews: [packaged.preview], artifacts: packaged.artifacts };
  } finally {
    await runtime.close().catch(() => undefined);
  }
}

export async function runDirectorStitchTurn(
  input: DirectorStitchTurnInput & { designBriefMarkdown: string; businessName?: string },
): Promise<DirectorStitchTurnResult> {
  if (!isGoogleStitchConfigured()) {
    throw new GoogleStitchError("Google Stitch is not configured", "AUTH_FAILED");
  }

  const t0 = Date.now();
  const requestDeadlineMs = Date.now() + getStitchInRequestDeadlineMs();
  const runtime = await createGoogleStitchRuntime();

  try {
    const priorSession = await loadLatestStitchSession(input.userId);
    const operation = resolveStitchMediaOperation(input.operatorMessage, priorSession);
    const deviceType = resolveEffectiveStitchDeviceType(
      input.operatorMessage,
      priorSession,
      operation,
    );
    const modelId = resolveStitchModelId(input.operatorMessage);
    const renderId = randomUUID();
    const prompt = buildStitchGenerationPrompt(input.operatorMessage, {
      businessName: input.businessName,
      designBriefMarkdown: input.designBriefMarkdown,
    });

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
      requestDeadlineMs,
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
      const wallLeftMs = requestDeadlineMs - Date.now() - 10_000;
      const screensLeft = screens.length - i;
      const perScreenBudget =
        screensLeft > 1
          ? Math.max(15_000, Math.floor(wallLeftMs / screensLeft))
          : wallLeftMs;
      const assets =
        wallLeftMs < 8_000
          ? await fetchScreenAssets(runtime, screen, input.signal)
          : await fetchScreenAssetsWithRetry(runtime, screen, input.signal, {
              context: "in-request",
              pollDelaysMs: getStitchInRequestAssetPollDelaysMs(
                Math.min(perScreenBudget, STITCH_IN_REQUEST_ASSET_POLL_MS),
              ),
            });

      const suffix = screens.length > 1 ? `-v${i + 1}` : "";
      const title =
        screens.length > 1
          ? `Variant ${i + 1}`
          : deviceType === "MOBILE"
            ? "Mobile screen"
            : "Screen";

      const packaged = await packageStitchScreenAssets({
        userId: input.userId,
        operatorMessage: input.operatorMessage,
        screenId,
        projectId,
        deviceType,
        renderId,
        assets,
        title,
        artifactSuffix: suffix,
      });
      artifacts.push(...packaged.artifacts);
      if (packaged.preview) {
        previews.push(packaged.preview);
        thinkingLines.push(`Screen ${screenId} (${deviceType})`);
      }
    }

    const primary = screens[0]!;
    const stitchSession: StitchSession = {
      projectId: primary.projectId || project.projectId,
      screenId: primary.screenId,
      projectTitle: project.projectTitle,
      deviceType,
      renderId,
      operatorMessage: input.operatorMessage.trim().slice(0, 4000),
    };

    const durationMs = Date.now() - t0;

    if (previews.length === 0) {
      log.warn("stitch assets pending after in-request poll", {
        projectId: stitchSession.projectId,
        screenId: stitchSession.screenId,
        userId: input.userId,
      });
      return {
        reply: WIRELINE_STITCH_UI.packagingPendingReply,
        previews: [],
        artifacts,
        stitchSession,
        stitchAssetsPending: true,
        thinkingSummary: `Screen ${stitchSession.screenId} (${deviceType}) — packaging`,
        durationMs,
      };
    }

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

export type StitchPreparedTurn =
  | { phase: "clarify"; turn: DirectorStitchTurnResult }
  | {
      phase: "render";
      input: DirectorStitchTurnInput & { designBriefMarkdown: string; businessName?: string };
    };

export type DirectorStitchTurnAttempt =
  | { kind: "turn"; turn: DirectorStitchTurnResult }
  | { kind: "not-configured" }
  | { kind: "recoverable-failure"; error: GoogleStitchError }
  | { kind: "hard-failure"; error: GoogleStitchError };

function isRecoverableStitchFailure(error: GoogleStitchError): boolean {
  if (error.code === "AUTH_FAILED") return false;
  if (error.code === "VALIDATION_ERROR" && !error.recoverable) return false;
  return error.recoverable;
}

/** Brief gate + design.md — runs even when Stitch API is not configured. */
export async function prepareStitchDirectorTurn(
  input: DirectorStitchTurnInput,
): Promise<StitchPreparedTurn> {
  const t0 = Date.now();
  const branding = await loadStitchTenantBranding(input.userId);
  const useAccountBranding = resolveUseAccountBranding(input.stitchOptions, branding);
  const history = input.history ?? [];
  const priorSession = await loadLatestStitchSession(input.userId);
  const operation = resolveStitchMediaOperation(input.operatorMessage, priorSession);
  const brief = parseStitchDesignBrief(input.operatorMessage, history, branding);
  const designBriefMarkdown = buildStitchDesignMarkdown({
    brief,
    branding,
    useAccountBranding,
  });
  const missing = missingStitchBriefFields(brief, operation, Boolean(priorSession), {
    designMode: input.stitchOptions?.designMode === true,
  });

  if (missing.length > 0) {
    const clarifyingQuestions = stitchClarifyingQuestions(missing);
    return {
      phase: "clarify",
      turn: {
        reply: buildStitchClarifyReply(missing, designBriefMarkdown, useAccountBranding),
        previews: [],
        artifacts: [buildStitchDesignBriefArtifact(designBriefMarkdown)],
        clarifyingQuestions,
        designBriefMarkdown,
        thinkingSummary: "Gathering design requirements",
        durationMs: Date.now() - t0,
      },
    };
  }

  const businessName =
    input.businessName?.trim() ||
    brief.businessName ||
    branding.businessName ||
    branding.brandName ||
    undefined;

  return {
    phase: "render",
    input: {
      ...input,
      businessName,
      designBriefMarkdown,
    },
  };
}

/**
 * Non-throwing entry. Clarify/render successes return `turn`; disabled Stitch returns
 * `not-configured`; render/package failures are classified so callers can decide
 * whether to draft the design in chat or surface a hard unavailable message.
 */
export async function tryDirectorStitchTurn(
  input: DirectorStitchTurnInput,
): Promise<DirectorStitchTurnAttempt> {
  try {
    const prepared = await prepareStitchDirectorTurn(input);
    if (prepared.phase === "clarify") return { kind: "turn", turn: prepared.turn };
    if (!isGoogleStitchConfigured()) return { kind: "not-configured" };
    return { kind: "turn", turn: await runDirectorStitchTurn(prepared.input) };
  } catch (e) {
    const error = mapStitchError(e);
    const kind = isRecoverableStitchFailure(error) ? "recoverable-failure" : "hard-failure";
    log.warn("director stitch turn failed", {
      userId: input.userId,
      error: getErrorMessage(error),
      code: error.code,
      recoverable: error.recoverable,
      fallbackKind: kind,
    });
    return { kind, error };
  }
}
