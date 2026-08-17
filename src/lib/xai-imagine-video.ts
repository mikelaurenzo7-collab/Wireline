/**
 * xAI Imagine video — documented, not offered.
 *
 * Wireline does not generate video files and does not substitute a script.
 * Official REST (`POST /v1/videos/generations`) has no watermark field.
 * Generated files include a Grok watermark. xAI's FAQ says there is no setting
 * to remove it. The Acceptable Use Policy forbids stripping, altering, or
 * circumventing watermarks.
 *
 * A later vendor may own real clips. Until then, the agent focuses on phone,
 * email, and text. This is not Grok Bot.
 */
import { AppError } from "./api-error";
import { XAI_MODELS } from "./ai-models";

export const XAI_IMAGINE_VIDEO_MODEL = XAI_MODELS.GROK_IMAGINE_VIDEO;
export const XAI_VIDEO_GENERATIONS_URL = "https://api.x.ai/v1/videos/generations";
export const XAI_IMAGINE_DURATION_MIN = 1;
export const XAI_IMAGINE_DURATION_MAX = 15;
export const XAI_IMAGINE_DURATION_DEFAULT = 8;

export const XAI_IMAGINE_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type XaiImagineAspectRatio = (typeof XAI_IMAGINE_ASPECT_RATIOS)[number];

export const XAI_IMAGINE_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type XaiImagineResolution = (typeof XAI_IMAGINE_RESOLUTIONS)[number];

const ASPECT_SET = new Set<string>(XAI_IMAGINE_ASPECT_RATIOS);
const RESOLUTION_SET = new Set<string>(XAI_IMAGINE_RESOLUTIONS);

export const IMAGINE_VIDEO_GENERATION_OFFERED = false;
export const IMAGINE_WATERMARK_NOT_OFFERED_CODE = "IMAGINE_WATERMARK_NOT_OFFERED";
export const IMAGINE_WATERMARK_NOT_OFFERED_MESSAGE =
  "Wireline does not generate video files. Those files include a Grok watermark that cannot be turned off. Phone, email, and text are unaffected.";

export function imagineVideoGenerationOffered(): boolean {
  return IMAGINE_VIDEO_GENERATION_OFFERED;
}

export function xaiImagineVideoConfigured(): boolean {
  return false;
}

export function assertImagineVideoGenerationOffered(): never {
  throw new AppError(
    410,
    IMAGINE_WATERMARK_NOT_OFFERED_CODE,
    IMAGINE_WATERMARK_NOT_OFFERED_MESSAGE,
  );
}

export function clampImagineDuration(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return XAI_IMAGINE_DURATION_DEFAULT;
  return Math.min(XAI_IMAGINE_DURATION_MAX, Math.max(XAI_IMAGINE_DURATION_MIN, Math.round(n)));
}

export function normalizeImagineAspectRatio(value: unknown): XaiImagineAspectRatio {
  return typeof value === "string" && ASPECT_SET.has(value)
    ? (value as XaiImagineAspectRatio)
    : "16:9";
}

export function normalizeImagineResolution(value: unknown): XaiImagineResolution {
  return typeof value === "string" && RESOLUTION_SET.has(value)
    ? (value as XaiImagineResolution)
    : "720p";
}

export function normalizeImaginePrompt(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 4_000);
}

/** Documents the public REST body. Wireline does not POST this. */
export function buildImagineGenerationBody(input: {
  prompt: string;
  duration?: number;
  aspectRatio?: unknown;
  resolution?: unknown;
  user?: string;
}): Record<string, unknown> {
  const prompt = normalizeImaginePrompt(input.prompt);
  if (!prompt) throw AppError.fromHttpStatus(400, "A video prompt is required.");
  return {
    model: XAI_IMAGINE_VIDEO_MODEL,
    prompt,
    duration: clampImagineDuration(input.duration),
    aspect_ratio: normalizeImagineAspectRatio(input.aspectRatio),
    resolution: normalizeImagineResolution(input.resolution),
    ...(input.user?.trim() ? { user: input.user.trim().slice(0, 128) } : {}),
  };
}
