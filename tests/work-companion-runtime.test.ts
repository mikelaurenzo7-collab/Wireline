import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  formatWorkCompanionCallPrep,
  isWorkCompanionKind,
  normalizeWorkCompanionBrief,
  WORK_COMPANION_KINDS,
} from "../src/lib/work-companion-runtime";
import {
  IMAGINE_VIDEO_GENERATION_OFFERED,
  IMAGINE_WATERMARK_NOT_OFFERED_CODE,
  assertImagineVideoGenerationOffered,
  buildImagineGenerationBody,
  imagineVideoGenerationOffered,
} from "../src/lib/xai-imagine-video";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("work companion runtime", () => {
  it("exposes the prep kinds without send or dial actions", () => {
    expect([...WORK_COMPANION_KINDS]).toEqual([
      "outbound_research",
      "talent_scout",
      "paid_media",
      "creative",
      "account_health",
      "call_brief",
      "video_clip",
    ]);
    expect(isWorkCompanionKind("call_brief")).toBe(true);
    expect(isWorkCompanionKind("dial")).toBe(false);
  });

  it("formats a compact CALL PREP block from reviewable fields", () => {
    const brief = normalizeWorkCompanionBrief("call_brief", "Acme", {
      facts: ["Acme asked for a Tuesday callback"],
      inferences: ["They may be comparing vendors"],
      pending_approval: ["Do not offer a discount"],
      unresolved: ["Who is the decision maker?"],
      call_objective: "Confirm the Tuesday callback and the decision maker.",
    });
    const block = formatWorkCompanionCallPrep(brief);
    expect(block).toContain("## CALL PREP");
    expect(block).toContain("Confirm the Tuesday callback");
    expect(block).toContain("Acme asked for a Tuesday callback");
    expect(block).toContain("Who is the decision maker?");
    expect(block).not.toMatch(/grok bot/i);
  });

  it("keeps companion routes authenticated, gated, and registered", () => {
    const routes = read("src/routes/work-companion-routes.ts");
    const registry = read("src/server/register-api-routes.ts");
    const runtime = read("src/lib/work-companion-runtime.ts");
    const outbound = read("src/lib/vapi-client.ts");
    expect(registry).toContain("workCompanionRouter");
    expect(routes).toContain('"/api/work-companions"');
    expect(routes).toContain('"/api/work-companions/runs"');
    expect(routes).toContain('"/api/work-companions/video"');
    expect(routes).toContain("authenticateUser");
    expect(routes).toContain("enforceLaunchHardGate");
    expect(routes).toContain("enforceSpendCap");
    expect(routes).toContain('withAudit("work_companions.run")');
    expect(routes).toContain("assertImagineVideoGenerationOffered");
    expect(runtime).toContain("Never send email, never dial");
    expect(runtime).toContain("never generate a video file");
    expect(runtime).not.toContain("startImagineVideo");
    expect(outbound).toContain("loadWorkCompanionCallPrep");
    expect(outbound).toContain("callPrep");
    expect(read("docs/GROK_BOT_COMPANION_RUNTIME.md")).toContain("There is no Grok Bot HTTP API");
    expect(read("docs/GROK_BOT_COMPANION_RUNTIME.md")).toContain("IMAGINE_WATERMARK_NOT_OFFERED");
    expect(read("docs/GROK_BOT_COMPANION_RUNTIME.md")).toContain(
      "do not build a Grok Bot subagent, special runtime, or Cursor-teammate clone",
    );
    expect(read("docs/GROK_BOT_COMPANION_RUNTIME.md")).toContain("https://trywireline.com/mcp");
  });

  it("drafts video clip scripts without generating a watermarked file", () => {
    const brief = normalizeWorkCompanionBrief("video_clip", "Acme recap", {
      facts: ["Acme asked for a 20-second lobby loop"],
      inferences: ["A short kiosk clip is enough"],
      pending_approval: ["Do not publish until a human reviews the script"],
      unresolved: ["Which offer should appear on screen?"],
      call_objective: "Draft a lobby clip script for Acme.",
      video: {
        prompt: "A calm lobby recap of Acme's Tuesday callback, no live conversation.",
        duration: 8,
        aspect_ratio: "16:9",
        generation: "not_offered",
      },
    });
    expect(brief.video?.prompt).toContain("lobby recap");
    expect(brief.video?.generation).toBe("not_offered");
    expect(brief.kind).toBe("video_clip");
  });
});

describe("xAI Imagine video is not offered", () => {
  it("documents the REST body without a watermark field and refuses generation", () => {
    const body = buildImagineGenerationBody({
      prompt: "A calm lobby recap",
      duration: 8,
      aspectRatio: "16:9",
      resolution: "720p",
      user: "user-1",
    });
    expect(body).toEqual({
      model: "grok-imagine-video-1.5",
      prompt: "A calm lobby recap",
      duration: 8,
      aspect_ratio: "16:9",
      resolution: "720p",
      user: "user-1",
    });
    expect(body).not.toHaveProperty("watermark");
    expect(IMAGINE_VIDEO_GENERATION_OFFERED).toBe(false);
    expect(imagineVideoGenerationOffered()).toBe(false);
    expect(() => assertImagineVideoGenerationOffered()).toThrow(/watermark/i);
    try {
      assertImagineVideoGenerationOffered();
    } catch (error) {
      expect(error).toMatchObject({ status: 410, code: IMAGINE_WATERMARK_NOT_OFFERED_CODE });
    }
    expect(read("src/lib/xai-imagine-video.ts")).toContain(XAI_VIDEO_GENERATIONS_URL_SNIPPET);
    expect(read("src/pages/LiveVideoStudioPage.tsx")).not.toContain("/api/work-companions/video");
    expect(read("src/pages/LiveVideoStudioPage.tsx")).toContain("Draft clip script");
  });
});

const XAI_VIDEO_GENERATIONS_URL_SNIPPET = "https://api.x.ai/v1/videos/generations";
