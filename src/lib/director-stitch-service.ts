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

/** Inline data-URL in message metadata so the device frame renders without a client blob round-trip. */
const STITCH_PREVIEW_MAX_BYTES = 900_000;

export interface DirectorStitchTurnResult {
  reply: string;
  previews: DirectorPreviewMeta[];
  artifacts: Array<Record<string, unknown>>;
  stitchSession: StitchSession;
  thinkingSummary: string;
  durationMs: number;
}

export type StitchProgressCallback = (message: string) => void;

function pickDownloadUrl(screen: Record<string, unknown>, kind: "html" | "image"): string | null {
  const htmlBlock = screen.htmlCode as { downloadUrl?: string } | undefined;
  const shot = screen.screenshot as { downloadUrl?: string } | undefined;
  if (kind === "html") {
    return (
      htmlBlock?.downloadUrl ||
      (screen.htmlDownloadUrl as string | undefined) ||
      (screen.htmlUrl as string | undefined) ||
      null
    );
  }
  return (
    shot?.downloadUrl ||
    (screen.imageDownloadUrl as string | undefined) ||
    (screen.screenshotUrl as string | undefined) ||
    null
  );
}

const STITCH_ASSET_TOOL_TIMEOUT_MS = 60_000;

function stitchScreenToolArgs(projectId: string, screenId: string): Record<string, string> {
  return {
    projectId,
    screenId,
    name: `projects/${projectId}/screens/${screenId}`,
  };
}

async function fetchRemoteAsset(url: string, signal?: AbortSignal): Promise<Buffer> {
  const host = new URL(url).hostname;
  if (
    !/\.googleapis\.com$|\.googleusercontent\.com$|\.gstatic\.com$|\.cloud\.google\.com$/i.test(
      host,
    )
  ) {
    throw new GoogleStitchError(`Refusing non-Google asset host: ${host}`, "VALIDATION_ERROR");
  }
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new GoogleStitchError(`Asset download failed (${res.status})`, "NETWORK_ERROR", true);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

async function fetchScreenAssets(
  client: GoogleStitchMcpClient,
  projectId: string,
  screenId: string,
  signal?: AbortSignal,
): Promise<{ html?: Buffer; image?: Buffer; screen: Record<string, unknown> }> {
  const args = stitchScreenToolArgs(projectId, screenId);
  let screen: Record<string, unknown> = { screenId, projectId };
  let html: Buffer | undefined;
  let image: Buffer | undefined;

  try {
    const payload = await client.callTool<unknown>(
      "get_screen",
      args,
      signal,
      STITCH_ASSET_TOOL_TIMEOUT_MS,
    );
    screen = mergeStitchScreenRecord(screen, payload);
  } catch {
    /* download URLs may lag — fall through to dedicated asset tools */
  }

  let htmlUrl = pickDownloadUrl(screen, "html");
  let imageUrl = pickDownloadUrl(screen, "image");

  if (!html) {
    for (const tool of ["get_screen_code", "fetch_screen_code"] as const) {
      try {
        const payload = await client.callTool<unknown>(
          tool,
          args,
          signal,
          STITCH_ASSET_TOOL_TIMEOUT_MS,
        );
        html = extractStitchInlineHtml(payload);
        screen = mergeStitchScreenRecord(screen, payload);
        htmlUrl = htmlUrl || pickDownloadUrl(screen, "html");
        if (html) break;
      } catch {
        /* try alternate tool name */
      }
    }
  }

  if (!image) {
    for (const tool of ["get_screen_image", "fetch_screen_image"] as const) {
      try {
        const payload = await client.callTool<unknown>(
          tool,
          args,
          signal,
          STITCH_ASSET_TOOL_TIMEOUT_MS,
        );
        image = extractStitchInlineImage(payload);
        screen = mergeStitchScreenRecord(screen, payload);
        imageUrl = imageUrl || pickDownloadUrl(screen, "image");
        if (image) break;
      } catch {
        /* try alternate tool name */
      }
    }
  }

  if (!html && htmlUrl) {
    html = await fetchRemoteAsset(htmlUrl, signal).catch(() => undefined);
  }
  if (!image && imageUrl) {
    image = await fetchRemoteAsset(imageUrl, signal).catch(() => undefined);
  }

  return { html, image, screen };
}

/** Stitch screenshot/HTML can lag the screen record — poll until at least one asset is ready. */
async function fetchScreenAssetsWithRetry(
  client: GoogleStitchMcpClient,
  projectId: string,
  screenId: string,
  signal?: AbortSignal,
): Promise<{ html?: Buffer; image?: Buffer; screen: Record<string, unknown> }> {
  const delaysMs = [
    0, 3_000, 6_000, 9_000, 12_000, 16_000, 20_000, 25_000, 30_000, 36_000, 42_000, 48_000, 55_000,
    62_000, 70_000, 78_000, 86_000, 95_000,
  ];
  let last = await fetchScreenAssets(client, projectId, screenId, signal);
  for (let i = 1; i < delaysMs.length; i++) {
    if (last.html || last.image) return last;
    await sleepMs(delaysMs[i]! - delaysMs[i - 1]!, signal);
    last = await fetchScreenAssets(client, projectId, screenId, signal);
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

  onProgress?.("Generating Stitch screen (1–3 min)…");
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
    const assets = await fetchScreenAssetsWithRetry(client, projectId, screenId, input.signal);

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
