import { describe, expect, it } from "vitest";

import {
  IMAGINE_WATERMARK_NOT_OFFERED_CODE,
  XAI_IMAGE_GENERATIONS_URL,
  XAI_IMAGINE_IMAGE_MODELS,
  XAI_IMAGINE_VIDEO_MODEL,
  assertImagineVideoGenerationOffered,
  buildImagineGenerationBody,
  clampImagineDuration,
  imagineImageGenerationOffered,
  imagineVideoGenerationOffered,
  normalizeImagineAspectRatio,
} from "../src/lib/xai-imagine-video";

describe("xAI Imagine client", () => {
  it("documents retired vendor ids without a watermark field", () => {
    const body = buildImagineGenerationBody({
      prompt: "A calm lobby recap",
      duration: 8,
      aspectRatio: "16:9",
      resolution: "720p",
      user: "user-1",
    });
    expect(body).toEqual({
      model: XAI_IMAGINE_VIDEO_MODEL,
      prompt: "A calm lobby recap",
      duration: 8,
      aspect_ratio: "16:9",
      resolution: "720p",
      user: "user-1",
    });
    expect(body).not.toHaveProperty("watermark");
    expect(XAI_IMAGINE_VIDEO_MODEL).toBe("grok-imagine-video-1.5");
    expect(XAI_IMAGINE_IMAGE_MODELS).toContain("grok-imagine-image");
    expect(XAI_IMAGE_GENERATIONS_URL).toContain("/v1/images/generations");
  });

  it("refuses Imagine photos and video files", () => {
    expect(clampImagineDuration(0)).toBe(1);
    expect(clampImagineDuration(40)).toBe(15);
    expect(normalizeImagineAspectRatio("9:16")).toBe("9:16");
    expect(normalizeImagineAspectRatio("square")).toBe("16:9");
    expect(() => buildImagineGenerationBody({ prompt: "  " })).toThrow(/video prompt/i);
    expect(imagineVideoGenerationOffered()).toBe(false);
    expect(imagineImageGenerationOffered()).toBe(false);
    try {
      assertImagineVideoGenerationOffered();
      throw new Error("expected Imagine generation to be refused");
    } catch (error) {
      expect(error).toMatchObject({ status: 410, code: IMAGINE_WATERMARK_NOT_OFFERED_CODE });
    }
  });
});
