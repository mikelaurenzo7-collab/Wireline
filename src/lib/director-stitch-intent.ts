/**
 * Intent routing for Google Stitch media generation in Director.
 */
import {
  wantsCodeDeliverable,
  wantsLogoCreativePath,
  wantsWebsiteDeliverable,
} from "./director-deliverables";

export type StitchDeviceType = "DESKTOP" | "MOBILE" | "TABLET" | "AGNOSTIC";
export type StitchMediaOperation = "generate" | "edit" | "variants" | "build_site";
export type StitchModelId = "GEMINI_3_FLASH" | "GEMINI_3_1_PRO";
export type StitchVariantAspect =
  | "LAYOUT"
  | "COLOR_SCHEME"
  | "IMAGES"
  | "TEXT_FONT"
  | "TEXT_CONTENT";

export interface StitchSession {
  projectId: string;
  screenId: string;
  projectTitle?: string;
}

const STITCH_UI_MEDIA_SIGNAL =
  /\b(ui\s+mockup|mockup|wireframe|screen\s+design|app\s+screen|dashboard\s+design|hero\s+(?:image|section|banner)|homepage\s+hero|homepage\s+design|landing\s+(?:page\s+)?design|visual\s+design|generate\s+(?:a\s+)?(?:ui|screen|mockup|prototype|banner)|design\s+(?:a\s+|the\s+)?(?:[\w-]+\s+)*?(?:ui|app|mobile|screen|mockup)|mobile\s+app\s+ui|web\s+app\s+ui|product\s+design|interface\s+design|figma(?:\s+style)?)\b/i;

const STITCH_EDIT_SIGNAL =
  /\b(edit|change|update|revise|retouch|tweak|adjust|refine|make\s+(?:it|the)|darker|lighter|sidebar|swap\s+(?:the\s+)?hero|new\s+color|different\s+font)\b/i;

const STITCH_VARIANT_SIGNAL =
  /\b(variants?|alternatives?|options?|color\s+schemes?|different\s+layouts?|try\s+\d+|explore\s+(?:design|options|layouts)|reimagine|a\/b)\b/i;

const STITCH_BUILD_SITE_SIGNAL =
  /\b(multi-?page|full\s+(?:website|site)|build\s+(?:out\s+)?(?:the\s+)?(?:whole|entire)\s+site|several\s+pages|all\s+pages|complete\s+site|site\s+build)\b/i;

/** UI / visual media that Stitch should render (not logo vector creative tools). */
export function wantsStitchMediaRequest(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || wantsLogoCreativePath(trimmed)) return false;
  if (wantsWebsiteDeliverable(trimmed)) return true;
  if (STITCH_UI_MEDIA_SIGNAL.test(trimmed)) return true;
  if (/\b(mockup|wireframe|prototype)\b/i.test(trimmed) && !wantsCodeDeliverable(trimmed)) {
    return true;
  }
  return false;
}

export function resolveStitchDeviceType(message: string): StitchDeviceType {
  const m = message.toLowerCase();
  if (/\b(mobile|phone|ios|android|smartphone)\b/.test(m)) return "MOBILE";
  if (/\b(tablet|ipad)\b/.test(m)) return "TABLET";
  if (/\b(desktop|wide|monitor|1440)\b/.test(m)) return "DESKTOP";
  if (wantsWebsiteDeliverable(message) || /\b(homepage|landing)\b/i.test(m)) return "MOBILE";
  return "AGNOSTIC";
}

export function resolveStitchModelId(message: string): StitchModelId {
  if (/\b(fast|quick|draft|rapid)\b/i.test(message)) return "GEMINI_3_FLASH";
  if (/\b(polish|production|high[\s-]?fi|pixel[\s-]?perfect)\b/i.test(message)) {
    return "GEMINI_3_1_PRO";
  }
  if (wantsWebsiteDeliverable(message) || /\blanding\s+page\b/i.test(message)) {
    return "GEMINI_3_1_PRO";
  }
  return "GEMINI_3_FLASH";
}

export function resolveStitchMediaOperation(
  message: string,
  session: StitchSession | null,
): StitchMediaOperation {
  const trimmed = message.trim();
  if (STITCH_BUILD_SITE_SIGNAL.test(trimmed)) return "build_site";
  if (session && STITCH_VARIANT_SIGNAL.test(trimmed)) return "variants";
  if (session && STITCH_EDIT_SIGNAL.test(trimmed)) return "edit";
  return "generate";
}

export function resolveStitchVariantOptions(message: string): {
  variantCount: number;
  creativeRange: "REFINE" | "EXPLORE" | "REIMAGINE";
  aspects: StitchVariantAspect[];
} {
  const aspects: StitchVariantAspect[] = [];
  const lower = message.toLowerCase();
  if (/layout/.test(lower)) aspects.push("LAYOUT");
  if (/color/.test(lower)) aspects.push("COLOR_SCHEME");
  if (/image|photo|hero/.test(lower)) aspects.push("IMAGES");
  if (/font|typography/.test(lower)) aspects.push("TEXT_FONT");
  if (/copy|headline|text content/.test(lower)) aspects.push("TEXT_CONTENT");
  if (aspects.length === 0) aspects.push("LAYOUT", "COLOR_SCHEME");

  let creativeRange: "REFINE" | "EXPLORE" | "REIMAGINE" = "EXPLORE";
  if (/\b(subtle|refine|small tweak)\b/i.test(message)) creativeRange = "REFINE";
  if (/\b(reimagine|radical|totally different)\b/i.test(message)) creativeRange = "REIMAGINE";

  const countMatch = message.match(/\b(\d)\s+variants?\b/i);
  const variantCount = countMatch ? Math.min(5, Math.max(1, Number(countMatch[1]))) : 3;

  return { variantCount, creativeRange, aspects };
}

/** Compact Aurora Cream brief — appended to every Stitch generation for on-brand output. */
export const WIRELINE_STITCH_DESIGN_BRIEF =
  'Wireline "Aurora Cream" design system: paper #EFE9DC, ink #1A1614, brand #4F1E7B→#3B154C gradient CTAs, Fraunces italic headlines, Plus Jakarta Sans UI, JetBrains Mono labels (small caps, wide tracking). Sharp editorial corners (minimal radius), cream glass top shells, purple aurora-ring on active states. Premium B2B SaaS — production-ready, not generic AI-purple template.';

/** Enrich operator text into a Stitch-ready structured prompt. */
export function buildStitchGenerationPrompt(
  operatorMessage: string,
  opts?: { businessName?: string; designBriefMarkdown?: string },
): string {
  const base = operatorMessage.trim();
  const biz = opts?.businessName?.trim();
  const prefix = biz ? `Business: ${biz}. ` : "";
  const briefRaw = opts?.designBriefMarkdown?.trim();
  const briefForStitch = briefRaw
    ? (() => {
        const match = briefRaw.match(/### Operator request\s*\n([\s\S]*?)(?:\n##|\n```|$)/);
        const operatorSection = match?.[1]?.trim();
        return (operatorSection || briefRaw).slice(0, 1_200);
      })()
    : WIRELINE_STITCH_DESIGN_BRIEF;
  return `${prefix}${base}. Follow this design brief:\n\n${briefForStitch}\n\nDeliver production-ready semantic HTML with accessible labels, a single <style> block or inline CSS, mobile-first layout unless desktop/web is requested, and realistic placeholder content matching the industry in the request.`;
}
