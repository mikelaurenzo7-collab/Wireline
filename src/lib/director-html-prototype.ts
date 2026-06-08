/**
 * Extract and persist HTML prototypes from Design Studio / chat fallbacks.
 */
import { randomUUID } from "node:crypto";
import { buildSignedDownloadUrl, buildSignedPreviewUrl } from "./director-artifact-signing";
import { storeDirectorArtifact } from "./director-artifacts";
import type { DirectorPreviewMeta } from "./director-message-metadata";
import { resolveStitchDeviceType } from "./director-stitch-intent";
import { WIRELINE_STITCH_UI } from "./wireline-director-design";

const HTML_FENCE_RE = /```(?:html)?\s*\n([\s\S]*?)```/i;

export function extractDirectorHtmlPrototype(content: string): string | null {
  const match = content.match(HTML_FENCE_RE);
  const raw = match?.[1]?.trim();
  if (!raw || raw.length < 80) return null;
  if (!/<html[\s>]/i.test(raw) && !/<!doctype/i.test(raw)) return null;
  return raw;
}

export function normalizeDirectorHtmlDocument(html: string): string {
  const trimmed = html.trim();
  if (/<!doctype/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) return trimmed;
  return `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Preview</title></head>\n<body>\n${trimmed}\n</body>\n</html>`;
}

export function inferPrototypeTitle(
  operatorMessage: string,
  pageTitle?: string,
): string {
  if (pageTitle?.trim()) return pageTitle.trim().slice(0, 120);
  const cleaned = operatorMessage.trim().replace(/\s+/g, " ");
  if (cleaned.length <= 72) return cleaned || "Your page";
  return `${cleaned.slice(0, 69)}…`;
}

/** Remove fenced HTML from chat copy when the inline preview carries the document. */
export function stripHtmlPrototypeFromReply(content: string): string {
  const stripped = content.replace(HTML_FENCE_RE, "").trim();
  const normalized = stripped.replace(/\n{3,}/g, "\n\n").trim();
  return normalized.length > 0 ? normalized : content.trim();
}

/**
 * When a turn reply contains ```html``` but no preview metadata yet (chat fallback),
 * persist the document and attach stitch-shaped preview metadata for the device frame.
 */
export async function attachDesignHtmlPrototypeToTurn(
  userId: string,
  operatorMessage: string,
  turnData: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const previews = Array.isArray(turnData.previews) ? turnData.previews : [];
  if (previews.length > 0) return turnData;

  const reply = typeof turnData.reply === "string" ? turnData.reply : "";
  const html = extractDirectorHtmlPrototype(reply);
  if (!html) return turnData;

  const packaged = await packageDirectorHtmlPrototypePreview({
    userId,
    operatorMessage,
    html,
  });

  const existingArtifacts = Array.isArray(turnData.artifacts) ? turnData.artifacts : [];

  return {
    ...turnData,
    reply: stripHtmlPrototypeFromReply(reply),
    previews: [packaged.preview],
    artifacts: [...existingArtifacts, ...packaged.artifacts],
  };
}

export async function packageDirectorHtmlPrototypePreview(input: {
  userId: string;
  operatorMessage: string;
  html: string;
  title?: string;
  deviceType?: DirectorPreviewMeta["deviceType"];
}): Promise<{ preview: DirectorPreviewMeta; artifacts: Array<Record<string, unknown>> }> {
  const html = normalizeDirectorHtmlDocument(input.html);
  const deviceType = input.deviceType ?? resolveStitchDeviceType(input.operatorMessage);
  const conceptId = `design-${randomUUID().slice(0, 8)}`;
  const renderId = randomUUID();
  const stamp = new Date().toISOString().slice(0, 10);
  const title = inferPrototypeTitle(input.operatorMessage, input.title);

  const saved = await storeDirectorArtifact({
    userId: input.userId,
    toolName: "wireline_design_studio",
    artifactType: "design-html",
    name: `design-${stamp}.html`,
    mimeType: "text/html; charset=utf-8",
    data: Buffer.from(html, "utf8"),
    metadata: {
      operatorPreview: input.operatorMessage.trim().slice(0, 120),
      deviceType,
      designStudio: true,
      stitchRenderId: renderId,
    },
  });

  const htmlDownloadUrl = buildSignedPreviewUrl("/api/director/artifacts", saved.id, input.userId);
  const artifact = {
    ...saved,
    downloadUrl: buildSignedDownloadUrl("/api/director/artifacts", saved.id, input.userId),
  };

  return {
    preview: {
      conceptId,
      title,
      rationale: WIRELINE_STITCH_UI.modelLabel,
      kind: "stitch",
      deviceType,
      previewDataUrl: "",
      htmlDownloadUrl,
      htmlArtifactId: saved.id,
      renderId,
    },
    artifacts: [artifact],
  };
}
