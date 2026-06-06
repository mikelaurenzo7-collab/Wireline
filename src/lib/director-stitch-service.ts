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
  extractStitchProjectId,
  extractStitchScreens,
  GoogleStitchError,
  GoogleStitchMcpClient,
} from "./google-stitch-mcp-client";
import { isGoogleStitchConfigured } from "./google-stitch-config";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

const STITCH_PREVIEW_MAX_BYTES = 400_000;

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

async function fetchRemoteAsset(url: string, signal?: AbortSignal): Promise<Buffer> {
  const host = new URL(url).hostname;
  if (!/\.googleapis\.com$|\.googleusercontent\.com$|\.gstatic\.com$/i.test(host)) {
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
  let screen: Record<string, unknown> = { screenId, projectId };
  let htmlUrl = pickDownloadUrl(screen, "html");
  let imageUrl = pickDownloadUrl(screen, "image");

  const toolNames = ["get_screen", "fetch_screen_code", "fetch_screen_image"] as const;
  for (const tool of toolNames) {
    try {
      const payload = await client.callTool<unknown>(
        tool,
        {
          projectId,
          screenId,
          name: `projects/${projectId}/screens/${screenId}`,
        },
        signal,
      );
      const screens = extractStitchScreens(payload);
      if (screens[0]) screen = { ...screen, ...screens[0] };
      htmlUrl = htmlUrl || pickDownloadUrl(screen, "html");
      imageUrl = imageUrl || pickDownloadUrl(screen, "image");
      if (htmlUrl && imageUrl) break;
    } catch {
      /* try next tool shape */
    }
  }

  const [html, image] = await Promise.all([
    htmlUrl ? fetchRemoteAsset(htmlUrl, signal).catch(() => undefined) : undefined,
    imageUrl ? fetchRemoteAsset(imageUrl, signal).catch(() => undefined) : undefined,
  ]);

  return { html, image, screen };
}

async function ensureStitchProject(
  client: GoogleStitchMcpClient,
  userId: string,
  session: StitchSession | null,
  onProgress?: StitchProgressCallback,
  signal?: AbortSignal,
): Promise<StitchSession> {
  if (session?.projectId) return session;
  onProgress?.("Creating Stitch project…");
  const created = await client.callTool<unknown>(
    "create_project",
    { title: `Wireline Director · ${userId.slice(0, 8)}` },
    signal,
  );
  const projectId = extractStitchProjectId(created);
  if (!projectId) {
    throw new GoogleStitchError("Stitch did not return a project id", "VALIDATION_ERROR");
  }
  return { projectId, screenId: "", projectTitle: "Wireline Director" };
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

  onProgress?.("Generating Stitch screen (1–3 min)…");
  const generated = await client.callTool<unknown>(
    "generate_screen_from_text",
    { projectId, prompt, deviceType, modelId },
    signal,
  );
  const screens = extractStitchScreens(generated);
  if (screens.length > 0) return screens;

  const projectIdFromGen = extractStitchProjectId(generated);
  if (projectIdFromGen) {
    onProgress?.("Fetching generated screens…");
    const listed = await client.callTool<unknown>(
      "list_screens",
      { projectId: projectIdFromGen, name: `projects/${projectIdFromGen}` },
      signal,
    );
    return extractStitchScreens(listed);
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
    `I rendered your **${opLabel}** with **Google Stitch** (${deviceType.toLowerCase()}).`,
    "",
    "**Included**",
    "- Screenshot preview in this thread",
    "- Downloadable HTML/CSS prototype in artifacts",
    "",
    "**What you can ask next**",
    "- “Make the hero darker” or “add a booking CTA” → Stitch edit",
    "- “Show 3 color variants” → Stitch variants",
    "- “Build out the full multi-page site” → Stitch site build",
    "",
    "No capability chip required — just describe the change in plain language.",
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
    const assets = await fetchScreenAssets(client, projectId, screenId, input.signal);

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
      imageDownloadUrl = buildSignedDownloadUrl("/api/director/artifacts", saved.id, input.userId);
      artifacts.push({ ...saved, downloadUrl: imageDownloadUrl });
      previewDataUrl =
        assets.image.byteLength <= STITCH_PREVIEW_MAX_BYTES
          ? `data:image/png;base64,${assets.image.toString("base64")}`
          : imageDownloadUrl;
    }

    previews.push({
      conceptId: screenId,
      title,
      rationale: "Google Stitch",
      kind: "stitch",
      deviceType,
      previewDataUrl: previewDataUrl || imageDownloadUrl || htmlDownloadUrl || "",
      htmlDownloadUrl,
      imageDownloadUrl,
    });

    thinkingLines.push(`Screen ${screenId} (${deviceType})`);
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
