/**
 * Intent routing for Google Stitch media generation in Director.
 */
import {
  wantsCodeDeliverable,
  wantsLogoCreativePath,
  wantsWebsiteDeliverable,
} from "./director-deliverables";
import type { StitchBriefOptions } from "./director-stitch-branding";

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
  deviceType?: StitchDeviceType;
  renderId?: string;
  operatorMessage?: string;
}

const STITCH_UI_MEDIA_SIGNAL =
  /\b(ui\s+mockup|mockup|wireframe|screen\s+design|app\s+screen|admin\s+dashboard|dashboard\s+design|operator\s+dashboard|hero\s+(?:image|section|banner)|homepage\s+hero|homepage\s+design|landing\s+(?:page\s+)?design|visual\s+design|generate\s+(?:a\s+)?(?:ui|screen|mockup|prototype|banner)|design\s+(?:a\s+|the\s+)?(?:[\w-]+\s+)*?(?:ui|app|mobile|screen|mockup|dashboard)|mobile\s+app\s+ui|web\s+app\s+ui|product\s+design|interface\s+design|figma(?:\s+style)?)\b/i;

const STITCH_EDIT_SIGNAL =
  /\b(edit|change|update|revise|retouch|tweak|adjust|refine|make\s+(?:it|the)|darker|lighter|sidebar|swap\s+(?:the\s+)?hero|new\s+color|different\s+font)\b/i;

const STITCH_VARIANT_SIGNAL =
  /\b(variants?|alternatives?|options?|color\s+schemes?|different\s+layouts?|try\s+\d+|explore\s+(?:design|options|layouts)|reimagine|a\/b)\b/i;

const STITCH_BUILD_SITE_SIGNAL =
  /\b(multi-?page|full\s+(?:website|site)|build\s+(?:out\s+)?(?:the\s+)?(?:whole|entire)\s+site|several\s+pages|all\s+pages|complete\s+site|site\s+build)\b/i;

/**
 * Content classifier for design-shaped operator messages — used for design.md,
 * deliverable guidance, and Opus escalation. It does NOT route Stitch turns;
 * routing is gated by the Design composer toggle (`designMode`), clarify
 * follow-ups, or an existing Stitch session edit/variant.
 */
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

const STITCH_CLARIFY_REPLY_SIGNAL =
  /before i generate screens|need a bit more context|reply with the missing details/i;

/** True when the operator turned on Wireline Design in the composer. */
export function isStitchDesignModeActive(stitchOptions?: StitchBriefOptions): boolean {
  return stitchOptions?.designMode === true;
}

/** Director asked for brief fields — the next operator message should stay on the Stitch path. */
export function hasPendingStitchClarifyInHistory(
  history: Array<{ role: "operator" | "director"; content: string }>,
): boolean {
  const lastDirector = [...history].reverse().find((h) => h.role === "director");
  if (!lastDirector) return false;
  return STITCH_CLARIFY_REPLY_SIGNAL.test(lastDirector.content);
}

/**
 * Single gate for Stitch routing — explicit Design toggle or answering a Stitch clarify turn.
 * Keyword sniffing alone does not enter design mode (avoids fleet vs design confusion).
 */
/** Follow-up edits/variants after a Stitch screen exists in this thread. */
export function shouldRouteStitchSessionFollowUp(
  operatorMessage: string,
  session: StitchSession | null | undefined,
): boolean {
  if (!session?.screenId || !session?.projectId) return false;
  const operation = resolveStitchMediaOperation(operatorMessage.trim(), session);
  return operation === "edit" || operation === "variants" || operation === "build_site";
}

export function shouldRouteDirectorMessageToStitch(
  operatorMessage: string,
  options?: {
    stitchOptions?: StitchBriefOptions;
    history?: Array<{ role: "operator" | "director"; content: string }>;
    stitchSession?: StitchSession | null;
  },
): boolean {
  if (!operatorMessage.trim()) return false;
  if (isStitchDesignModeActive(options?.stitchOptions)) return true;
  if (hasPendingStitchClarifyInHistory(options?.history ?? [])) return true;
  if (shouldRouteStitchSessionFollowUp(operatorMessage, options?.stitchSession)) return true;
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

export function resolveEffectiveStitchDeviceType(
  message: string,
  session: StitchSession | null,
  operation?: StitchMediaOperation,
): StitchDeviceType {
  const resolved = resolveStitchDeviceType(message);
  if (resolved !== "AGNOSTIC") return resolved;
  const op = operation ?? resolveStitchMediaOperation(message, session);
  if (
    (op === "edit" || op === "variants") &&
    session?.deviceType &&
    session.deviceType !== "AGNOSTIC"
  ) {
    return session.deviceType;
  }
  return resolved;
}

export function resolveStitchModelId(message: string): StitchModelId {
  if (/\b(fast|quick|draft|rapid)\b/i.test(message)) return "GEMINI_3_FLASH";
  const envDefault = process.env.GOOGLE_STITCH_DEFAULT_MODEL?.trim();
  if (envDefault === "GEMINI_3_FLASH") return "GEMINI_3_FLASH";
  return "GEMINI_3_1_PRO";
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

/** Legacy Wireline product UI brief — only when the operator explicitly asks for Wireline surfaces. */
export const WIRELINE_STITCH_DESIGN_BRIEF =
  'Wireline "Aurora Cream" design system: paper #EFE9DC, ink #1A1614, brand #4F1E7B→#3B154C gradient CTAs, Fraunces italic headlines, Plus Jakarta Sans UI, JetBrains Mono labels (small caps, wide tracking). Sharp editorial corners (minimal radius), cream glass top shells, purple aurora-ring on active states. Premium B2B SaaS — production-ready, not generic AI-purple template.';

/** Legacy Wireline dark product UI brief — only for explicit Wireline dark-mode requests. */
export const WIRELINE_STITCH_DARK_DESIGN_BRIEF =
  'Wireline "Aurora Dark" design system: paper #0D0D11, ink #E2E8F0, brand #7C3AED→#4C1D95 gradient CTAs, Plus Jakarta Sans UI, JetBrains Mono labels (small caps, wide tracking). Sharp editorial corners (minimal radius), dark glassmorphism panels with 1px border-white/10 and backdrop-blur-md, purple aurora-glow on active states. Premium B2B SaaS dashboard — production-ready, dark mode, not generic AI-purple template.';

/** Default delivery rules for client-owned Stitch renders (not Wireline product UI). */
export const CLIENT_STITCH_DELIVERY_BRIEF =
  "Design exclusively for the client's business, product, and audience named in the request. Use their industry, tone, and palette — never default to Wireline branding, Wireline Director, agent orchestration dashboards, or generic purple SaaS templates unless the operator explicitly asked for Wireline product UI.";

const WIRELINE_PRODUCT_SIGNAL =
  /\b(wireline\s+(?:director|mission\s+control|console|dashboard|app\s+ui|product\s+ui|aurora)|design\s+(?:the\s+)?wireline|wireline\s+design\s+system|aurora\s+cream)\b/i;

/** True when the operator is designing Wireline's own product surfaces (not a client deliverable). */
export function wantsWirelineProductDesign(message: string): boolean {
  return WIRELINE_PRODUCT_SIGNAL.test(message.trim());
}

/** Strip design.md to the sections Stitch needs (operator request + brand context). */
export function condenseStitchDesignBriefMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const kept: string[] = [];
  let inOperator = false;
  for (const line of lines) {
    if (/^### Operator request\b/i.test(line)) {
      inOperator = true;
      kept.push(line);
      continue;
    }
    if (inOperator && /^## /.test(line) && !/^### /.test(line)) break;
    if (inOperator) kept.push(line);
  }
  if (kept.length > 1) return kept.join("\n").trim();

  const sections: string[] = [];
  const brand = markdown.match(/## Brand[\s\S]*?(?=\n## |\n### Operator request|$)/i)?.[0]?.trim();
  const product = markdown
    .match(/## Product context[\s\S]*?(?=\n## |\n### Operator request|$)/i)?.[0]
    ?.trim();
  const visual = markdown
    .match(/## Visual system[\s\S]*?(?=\n## |\n### Operator request|$)/i)?.[0]
    ?.trim();
  const operator = markdown.match(/### Operator request[\s\S]*?(?=\n## Delivery|$)/i)?.[0]?.trim();
  const delivery = markdown.match(/## Delivery[\s\S]*?(?=\nShip semantic|$)/i)?.[0]?.trim();
  for (const block of [brand, product, visual, operator, delivery]) {
    if (block) sections.push(block);
  }
  return sections.join("\n\n").trim() || markdown.trim();
}

/** Enrich operator text into a Stitch-ready structured prompt. */
export function buildStitchGenerationPrompt(
  operatorMessage: string,
  opts?: { businessName?: string; designBriefMarkdown?: string },
): string {
  const base = operatorMessage.trim();
  const biz = opts?.businessName?.trim();
  const prefix = biz ? `Business: ${biz}. ` : "";
  const briefRaw = opts?.designBriefMarkdown?.trim();

  const hasDarkTheme =
    /\b(dark[\s-]?mode|dark[\s-]?theme|darker)\b/i.test(base) ||
    (briefRaw && /\b(dark[\s-]?mode|dark[\s-]?theme|darker)\b/i.test(briefRaw));

  let briefForStitch: string;
  if (briefRaw) {
    briefForStitch = condenseStitchDesignBriefMarkdown(briefRaw).slice(0, 2500);
  } else if (wantsWirelineProductDesign(base)) {
    briefForStitch = hasDarkTheme
      ? WIRELINE_STITCH_DARK_DESIGN_BRIEF
      : WIRELINE_STITCH_DESIGN_BRIEF;
  } else {
    briefForStitch = CLIENT_STITCH_DELIVERY_BRIEF;
  }

  return `${prefix}${base}. Follow this design brief:\n\n${briefForStitch}\n\nDeliver production-ready semantic HTML with accessible labels, a single <style> block or inline CSS, mobile-first layout unless desktop/web is requested, and realistic placeholder content matching the client's industry and brand — not Wireline unless explicitly requested.`;
}
