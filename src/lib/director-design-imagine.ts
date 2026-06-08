/**
 * Grok Imagine — hero photography and visual assets for Design Studio.
 * Separate from Grok 4.3 builder (text/HTML). Uses x-ai/grok-imagine-image-quality.
 */
import { isOpenRouterConfigured, runOpenRouterImageGeneration } from "./openrouter-structured";
import { WIRELINE_DESIGN_TEAM } from "./director-design-team";
import { resolveDesignPreviewDeviceType } from "./director-html-prototype";
import type { StitchDeviceType } from "./director-stitch-intent";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export type DesignImagineAssetRole = "hero_background" | "section_texture";

export interface DesignImagineAsset {
  role: DesignImagineAssetRole;
  dataUrl: string;
  cssVar: string;
  prompt: string;
}

/** Max embedded image payload per asset — keeps HTML preview under iframe limits. */
export const DESIGN_IMAGINE_MAX_BYTES_PER_ASSET = 520_000;

export function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1);
  return Math.floor((b64.length * 3) / 4);
}

export function buildHeroImaginePrompt(input: {
  operatorMessage: string;
  researchNotes?: string;
  designBriefMarkdown: string;
  deviceType?: StitchDeviceType;
}): string {
  const mobile = input.deviceType === "MOBILE" || input.deviceType === "TABLET";
  const industryHint = input.designBriefMarkdown.slice(0, 800);
  const research = input.researchNotes?.trim().slice(0, 600) ?? "";
  return [
    mobile
      ? "Photorealistic mobile hero background image for a premium business landing page."
      : "Photorealistic wide desktop web hero background for a premium business landing page.",
    mobile
      ? "Vertical 9:16 composition with negative space at top for headline overlay."
      : "Horizontal 16:9 composition with negative space on the left for headline overlay.",
    "Natural lighting, realistic textures, shallow depth of field.",
    "NO text, NO logos, NO watermarks, NO UI chrome, NO people's faces close-up.",
    `Business context: ${input.operatorMessage.trim().slice(0, 300)}`,
    research ? `Art direction: ${research}` : "",
    industryHint ? `Brief: ${industryHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildTextureImaginePrompt(input: {
  operatorMessage: string;
  researchNotes?: string;
}): string {
  return [
    "Subtle abstract texture overlay for a web hero — soft grain, light bokeh, brand-appropriate.",
    "Seamless, low-contrast, works as CSS background at 15% opacity over photography.",
    "NO text, NO logos, NO distinct objects.",
    `Mood from: ${input.operatorMessage.trim().slice(0, 200)}`,
    input.researchNotes?.trim().slice(0, 200) ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

function trimAssetDataUrl(dataUrl: string): string | null {
  if (!dataUrl.startsWith("data:image/")) return null;
  if (estimateDataUrlBytes(dataUrl) <= DESIGN_IMAGINE_MAX_BYTES_PER_ASSET) return dataUrl;
  return null;
}

export async function generateDesignImagineAssets(input: {
  operatorMessage: string;
  designBriefMarkdown: string;
  researchNotes?: string;
  deviceType?: StitchDeviceType;
  signal?: AbortSignal;
}): Promise<DesignImagineAsset[]> {
  const cfg = WIRELINE_DESIGN_TEAM.imageReference;
  if (!cfg.enabled || !isOpenRouterConfigured()) return [];

  const deviceType =
    input.deviceType ??
    resolveDesignPreviewDeviceType({
      operatorMessage: input.operatorMessage,
      designBriefMarkdown: input.designBriefMarkdown,
    });
  const mobile = deviceType === "MOBILE" || deviceType === "TABLET";
  const heroPrompt = buildHeroImaginePrompt({ ...input, deviceType });

  const assets: DesignImagineAsset[] = [];

  const heroModels = [cfg.openRouterModelId];
  const altCfg =
    "altImageReference" in WIRELINE_DESIGN_TEAM
      ? WIRELINE_DESIGN_TEAM.altImageReference
      : undefined;
  if (altCfg?.enabled) {
    heroModels.push(altCfg.openRouterModelId);
  }

  for (const modelId of heroModels) {
    if (assets.some((a) => a.role === "hero_background")) break;
    try {
      const heroUrls = await runOpenRouterImageGeneration({
        model: modelId,
        prompt: heroPrompt,
        aspectRatio: mobile ? "9:16" : "16:9",
        imageSize: "1K",
        signal: input.signal,
      });
      const heroData = trimAssetDataUrl(heroUrls[0] ?? "");
      if (heroData) {
        assets.push({
          role: "hero_background",
          dataUrl: heroData,
          cssVar: "--wl-hero-photo",
          prompt: heroPrompt,
        });
      }
    } catch (e) {
      log.warn("design studio hero image skipped", { model: modelId, error: getErrorMessage(e) });
    }
  }

  if (assets.length === 0) return assets;

  try {
    const textureUrls = await runOpenRouterImageGeneration({
      model: cfg.openRouterModelId,
      prompt: buildTextureImaginePrompt(input),
      aspectRatio: "1:1",
      imageSize: "1K",
      signal: input.signal,
    });
    const textureData = trimAssetDataUrl(textureUrls[0] ?? "");
    if (textureData) {
      assets.push({
        role: "section_texture",
        dataUrl: textureData,
        cssVar: "--wl-hero-texture",
        prompt: buildTextureImaginePrompt(input),
      });
    }
  } catch (e) {
    log.warn("design studio grok imagine texture skipped", { error: getErrorMessage(e) });
  }

  return assets;
}

export function formatImagineAssetsForBuilder(assets: DesignImagineAsset[]): string {
  if (!assets.length) return "";

  const lines = [
    "## Grok Imagine assets (MANDATORY when present)",
    "Use the photo hero pattern: `header.wl-hero.wl-hero--photo` with `.wl-hero-bg`, `.wl-hero-scrim`, `.wl-hero-content`.",
    "Set CSS custom properties in `:root` with the exact data URLs below.",
    "Apply subtle motion via kit classes (wl-hero-bg animates; respect prefers-reduced-motion).",
    "",
  ];

  for (const asset of assets) {
    lines.push(`### ${asset.role}`, `${asset.cssVar}: url('${asset.dataUrl}');`, "");
  }

  return lines.join("\n").trim();
}

/** Ensure generated photography is present even if the builder omitted it. */
export function injectImagineAssetsIntoHtml(
  html: string,
  assets: DesignImagineAsset[],
  deviceType: StitchDeviceType = "DESKTOP",
): string {
  const hero = assets.find((a) => a.role === "hero_background");
  if (!hero || html.includes(hero.dataUrl.slice(0, 80))) return html;

  const mobile = deviceType === "MOBILE" || deviceType === "TABLET";
  const texture = assets.find((a) => a.role === "section_texture");
  const rootVars = [
    `${hero.cssVar}: url('${hero.dataUrl}');`,
    texture ? `${texture.cssVar}: url('${texture.dataUrl}');` : "",
  ]
    .filter(Boolean)
    .join("\n  ");

  const heroMinHeight = mobile ? "70dvh" : "55vh";
  const heroContentMaxWidth = mobile ? "28rem" : "48rem";

  const photoCss = `
:root {
  ${rootVars}
}
.wl-hero--photo { position: relative; overflow: hidden; min-height: ${heroMinHeight}; padding: 0; max-width: none; }
.wl-hero-bg { position: absolute; inset: 0; background-image: var(${hero.cssVar}); background-size: cover; background-position: center; animation: wl-hero-drift 20s ease-in-out infinite alternate; }
.wl-hero-scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(15,23,42,.55) 0%, rgba(15,23,42,.25) 45%, rgba(15,23,42,.65) 100%); }
.wl-hero-content { position: relative; z-index: 1; padding: var(--wl-space-2xl) var(--wl-space-lg); max-width: ${heroContentMaxWidth}; margin: 0 auto; }
.wl-hero--photo .wl-headline, .wl-hero--photo .wl-subhead, .wl-hero--photo .wl-eyebrow { color: #fff; text-shadow: 0 1px 12px rgba(0,0,0,.35); }
.wl-hero--photo .wl-subhead { color: rgba(255,255,255,.88); }
@keyframes wl-hero-drift { from { transform: scale(1.03); } to { transform: scale(1.09); } }
@media (prefers-reduced-motion: reduce) { .wl-hero-bg { animation: none; } }
`;

  let out = html;
  if (/<style[\s>]/i.test(out)) {
    out = out.replace(/<style([^>]*)>/i, `<style$1>${photoCss}`);
  } else if (/<head[\s>]/i.test(out)) {
    out = out.replace(/<head([^>]*)>/i, `<head$1><style>${photoCss}</style>`);
  }

  if (/<header[^>]*class=["'][^"']*wl-hero/i.test(out) && !/wl-hero--photo/i.test(out)) {
    out = out.replace(
      /(<header[^>]*class=["'])([^"']*wl-hero[^"']*)(["'])/i,
      `$1$2 wl-hero--photo$3`,
    );
    out = out.replace(
      /(<header[^>]*class=["'][^"']*wl-hero[^"']*["'][^>]*>)/i,
      `$1<div class="wl-hero-bg" aria-hidden="true"></div><div class="wl-hero-scrim" aria-hidden="true"></div><div class="wl-hero-content">`,
    );
    out = out.replace(/<\/header>/i, "</div></header>");
  }

  return out;
}
