/**
 * Director × Google Stitch — generate, edit, variants, and site builds for UI media.
 */
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
  extractStitchInlineHtml,
  extractStitchInlineImage,
  extractStitchProjectId,
  extractStitchProjects,
  extractStitchScreens,
  GoogleStitchError,
  GoogleStitchMcpClient,
  mergeStitchScreenRecord,
  pickCompatibleStitchProject,
} from "./google-stitch-mcp-client";
import { getGoogleStitchProjectId, isGoogleStitchConfigured } from "./google-stitch-config";
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

const STITCH_ASSET_TOOL_TIMEOUT_MS = 25_000;

function stitchGetScreenArgVariants(
  projectId: string,
  screenId: string,
): Array<Record<string, string>> {
  return [
    { projectId, screenId },
    { projectId, screenId, name: `projects/${projectId}/screens/${screenId}` },
    { name: `projects/${projectId}/screens/${screenId}` },
  ];
}

function isAllowedStitchAssetHost(host: string): boolean {
  return (
    /\.googleapis\.com$/i.test(host) ||
    /\.googleusercontent\.com$/i.test(host) ||
    /\.gstatic\.com$/i.test(host) ||
    /\.cloud\.google\.com$/i.test(host) ||
    /\.withgoogle\.com$/i.test(host)
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

async function loadScreenViaGetScreen(
  client: GoogleStitchMcpClient,
  projectId: string,
  screenId: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (const args of stitchGetScreenArgVariants(projectId, screenId)) {
    try {
      const payload = await client.callTool<unknown>(
        "get_screen",
        args,
        signal,
        STITCH_ASSET_TOOL_TIMEOUT_MS,
      );
      return mergeStitchScreenRecord({ screenId, projectId }, payload);
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) {
    log.warn("stitch get_screen failed for all arg shapes", {
      projectId,
      screenId,
      error: getErrorMessage(lastErr),
    });
  }
  return { screenId, projectId };
}

async function fetchScreenAssets(
  client: GoogleStitchMcpClient,
  projectId: string,
  screenId: string,
  signal?: AbortSignal,
  screenHint?: Record<string, unknown>,
): Promise<{ html?: Buffer; image?: Buffer; screen: Record<string, unknown> }> {
  let screen: Record<string, unknown> = mergeStitchScreenRecord(
    { screenId, projectId },
    screenHint ?? {},
  );
  let html = extractStitchInlineHtml(screen);
  let image = extractStitchInlineImage(screen);

  const refreshed = await loadScreenViaGetScreen(client, projectId, screenId, signal);
  screen = mergeStitchScreenRecord(screen, refreshed);
  html = html ?? extractStitchInlineHtml(screen);
  image = image ?? extractStitchInlineImage(screen);

  const htmlUrl = pickDownloadUrl(screen, "html");
  const imageUrl = pickDownloadUrl(screen, "image");

  const [htmlPacked, imagePacked] = await Promise.all([
    (async (): Promise<Buffer | undefined> => {
      if (html) return html;
      if (!htmlUrl) return undefined;
      return fetchRemoteAsset(htmlUrl, signal).catch((e) => {
        log.warn("stitch html download failed", {
          screenId,
          error: getErrorMessage(e),
        });
        return undefined;
      });
    })(),
    (async (): Promise<Buffer | undefined> => {
      if (image) return image;
      if (!imageUrl) return undefined;
      return fetchRemoteAsset(imageUrl, signal).catch((e) => {
        log.warn("stitch image download failed", {
          screenId,
          error: getErrorMessage(e),
        });
        return undefined;
      });
    })(),
  ]);

  return { html: htmlPacked, image: imagePacked, screen };
}

/** Stitch screenshot/HTML can lag the screen record — poll until at least one asset is ready. */
async function fetchScreenAssetsWithRetry(
  client: GoogleStitchMcpClient,
  projectId: string,
  screenId: string,
  signal?: AbortSignal,
  screenHint?: Record<string, unknown>,
): Promise<{ html?: Buffer; image?: Buffer; screen: Record<string, unknown> }> {
  // Signed Stitch download URLs can lag screen creation by several minutes.
  const delaysMs = [
    0, 4_000, 8_000, 12_000, 18_000, 24_000, 32_000, 40_000, 50_000, 60_000, 72_000, 84_000, 96_000,
    110_000, 125_000, 140_000, 155_000, 170_000, 185_000, 200_000,
  ];
  let last = await fetchScreenAssets(client, projectId, screenId, signal, screenHint);
  for (let i = 1; i < delaysMs.length; i++) {
    if (last.html || last.image) return last;
    await sleepMs(delaysMs[i]! - delaysMs[i - 1]!, signal);
    last = await fetchScreenAssets(client, projectId, screenId, signal, screenHint);
  }
  return last;
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GoogleStitchError("Stitch request aborted", "NETWORK_ERROR", true));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new GoogleStitchError("Stitch request aborted", "NETWORK_ERROR", true));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

const STITCH_LIST_TIMEOUT_MS = 30_000;
/** Stitch compose alone is often 1–3 min; avoid aborting early into slow list polling. */
const STITCH_GENERATE_TIMEOUT_MS = 240_000;

async function listStitchScreens(
  client: GoogleStitchMcpClient,
  projectId: string,
  signal?: AbortSignal,
): Promise<Array<Record<string, unknown>>> {
  const args = { projectId, name: `projects/${projectId}` };
  try {
    const listed = await client.callTool<unknown>(
      "list_screens",
      args,
      signal,
      STITCH_LIST_TIMEOUT_MS,
    );
    const screens = extractStitchScreens(listed);
    if (screens.length > 0) return screens;
  } catch {
    /* try alternate shape */
  }
  try {
    const listed = await client.callTool<unknown>(
      "list_screens",
      { projectId },
      signal,
      STITCH_LIST_TIMEOUT_MS,
    );
    const screens = extractStitchScreens(listed);
    if (screens.length > 0) return screens;
  } catch {
    /* fall through */
  }
  try {
    const project = await client.callTool<unknown>(
      "get_project",
      { name: `projects/${projectId}` },
      signal,
      STITCH_LIST_TIMEOUT_MS,
    );
    return extractStitchScreens(project);
  } catch {
    return [];
  }
}

function pickNewestStitchScreens(
  screens: Array<Record<string, unknown>>,
  knownScreenIds: Set<string>,
): Array<Record<string, unknown>> {
  const fresh = screens.filter((s) => {
    const id = String(s.screenId ?? "").trim();
    return id && !knownScreenIds.has(id);
  });
  const pool = fresh.length > 0 ? fresh : screens;
  return [...pool].sort((a, b) => Number(b.screenId ?? 0) - Number(a.screenId ?? 0));
}

async function ensureStitchProject(
  client: GoogleStitchMcpClient,
  userId: string,
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
  let listed: unknown;
  try {
    listed = await client.callTool<unknown>(
      "list_projects",
      { filter: "view=owned" },
      signal,
      STITCH_LIST_TIMEOUT_MS,
    );
  } catch {
    listed = await client.callTool<unknown>("list_projects", {}, signal, STITCH_LIST_TIMEOUT_MS);
  }
  const picked = pickCompatibleStitchProject(extractStitchProjects(listed));
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
  client: GoogleStitchMcpClient,
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
): Promise<Array<Record<string, unknown>>> {
  const { operation, projectId, screenId, prompt, deviceType, modelId } = input;

  if (operation === "build_site") {
    onProgress?.("Building multi-page site in Stitch…");
    try {
      const built = await client.callTool<unknown>(
        "build_site",
        { projectId, prompt, deviceType, modelId },
        signal,
      );
      const screens = extractStitchScreens(built);
      if (screens.length > 0) return screens;
    } catch (e) {
      log.warn("stitch build_site unavailable, falling back to generate", {
        error: getErrorMessage(e),
      });
    }
  }

  if (operation === "variants" && screenId) {
    onProgress?.("Generating Stitch design variants…");
    const opts = resolveStitchVariantOptions(input.operatorMessage);
    const payload = await client.callTool<unknown>(
      "generate_variants",
      {
        projectId,
        selectedScreenIds: [screenId],
        prompt,
        variantCount: opts.variantCount,
        creativeRange: opts.creativeRange,
        aspects: opts.aspects,
        deviceType,
        modelId,
      },
      signal,
    );
    const screens = extractStitchScreens(payload);
    if (screens.length > 0) return screens;
  }

  if (operation === "edit" && screenId) {
    onProgress?.("Editing Stitch screen…");
    const payload = await client.callTool<unknown>(
      "edit_screens",
      {
        projectId,
        selectedScreenIds: [screenId],
        prompt,
        deviceType,
        modelId,
      },
      signal,
    );
    const screens = extractStitchScreens(payload);
    if (screens.length > 0) return screens;
  }

  const knownBefore = new Set(
    (await listStitchScreens(client, projectId, signal)).map((s) => String(s.screenId ?? "")),
  );

  onProgress?.("Generating Wireline Design screen (3–5 min)…");
  let generated: unknown;
  try {
    generated = await client.callTool<unknown>(
      "generate_screen_from_text",
      { projectId, prompt, deviceType, modelId },
      signal,
      STITCH_GENERATE_TIMEOUT_MS,
    );
  } catch (e) {
    log.warn("stitch generate_screen_from_text call ended early — polling screens", {
      error: getErrorMessage(e),
    });
    generated = null;
  }

  let screens = generated ? extractStitchScreens(generated) : [];
  if (screens.length > 0) return screens;

  const pollProjectId = extractStitchProjectId(generated) ?? projectId;
  onProgress?.("Waiting for Wireline Design to finish composing…");
  for (let attempt = 0; attempt < 12; attempt++) {
    await sleepMs(attempt === 0 ? 5_000 : 6_000, signal);
    const listed = await listStitchScreens(client, pollProjectId, signal);
    screens = pickNewestStitchScreens(listed, knownBefore);
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
  const client = new GoogleStitchMcpClient();
  const priorSession = await loadLatestStitchSession(input.userId);
  const operation = resolveStitchMediaOperation(input.operatorMessage, priorSession);
  const deviceType = resolveStitchDeviceType(input.operatorMessage);
  const modelId = resolveStitchModelId(input.operatorMessage);
  const prompt = buildStitchGenerationPrompt(input.operatorMessage, input.businessName);

  const project = await ensureStitchProject(
    client,
    input.userId,
    priorSession,
    input.onProgress,
    input.signal,
  );

  const screens = await runStitchOperation(
    client,
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
    const screenId = String(screen.screenId ?? screen.id ?? "").replace(/^screens\//, "");
    const projectId = String(screen.projectId ?? project.projectId).replace(/^projects\//, "");
    if (!screenId) continue;

    input.onProgress?.(`Downloading assets for screen ${i + 1}/${screens.length}…`);
    const assets = await fetchScreenAssetsWithRetry(
      client,
      projectId,
      screenId,
      input.signal,
      screen,
    );

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
  const primaryScreenId = String(primary.screenId ?? primary.id ?? "").replace(/^screens\//, "");
  const stitchSession: StitchSession = {
    projectId: String(primary.projectId ?? project.projectId).replace(/^projects\//, ""),
    screenId: primaryScreenId,
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
