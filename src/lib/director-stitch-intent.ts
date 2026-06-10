/**
 * Wireline Design intent — classifies design-shaped messages and resolves device/operation
 * metadata for design.md + Spectrum Desk (OpenRouter/Anthropic). No Google Stitch API.
 */
import {
  wantsCodeDeliverable,
  wantsLogoCreativePath,
  wantsWebsiteDeliverable,
} from "./director-deliverables";

export type StitchDeviceType = "DESKTOP" | "MOBILE" | "TABLET" | "AGNOSTIC";
/** @deprecated Use StitchDeviceType — kept for import stability */
export type DesignDeviceType = StitchDeviceType;
export type StitchMediaOperation = "generate" | "edit" | "variants" | "build_site";

export interface StitchBriefOptions {
  designMode?: boolean;
  useAccountBranding?: boolean;
}

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
 * routing is gated by the Design composer toggle (`designMode`) or clarify follow-ups.
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

/** Director asked for brief fields — the next operator message should stay on the design path. */
export function hasPendingStitchClarifyInHistory(
  history: Array<{ role: "operator" | "director"; content: string }>,
): boolean {
  const lastDirector = [...history].reverse().find((h) => h.role === "director");
  if (!lastDirector) return false;
  return STITCH_CLARIFY_REPLY_SIGNAL.test(lastDirector.content);
}

/**
 * Single gate for Wireline Design routing — explicit Design toggle or answering a clarify turn.
 * Keyword sniffing alone does not enter design mode (avoids fleet vs design confusion).
 */
export function shouldRouteDirectorMessageToStitch(
  operatorMessage: string,
  options?: {
    stitchOptions?: StitchBriefOptions;
    history?: Array<{ role: "operator" | "director"; content: string }>;
  },
): boolean {
  if (!operatorMessage.trim()) return false;
  if (isStitchDesignModeActive(options?.stitchOptions)) return true;
  if (hasPendingStitchClarifyInHistory(options?.history ?? [])) return true;
  return false;
}

export function resolveStitchDeviceType(message: string): StitchDeviceType {
  const m = message.toLowerCase();
  if (/\b(mobile|phone|ios|android|smartphone)\b/.test(m)) return "MOBILE";
  if (/\b(tablet|ipad)\b/.test(m)) return "TABLET";
  if (
    /\b(desktop|wide|monitor|1440|web\s+viewport|full[\s-]?width|desktop\s+web)\b/.test(m) ||
    /\b(admin\s+dashboard|operator\s+dashboard|dashboard|console|mission\s+control)\b/.test(m)
  ) {
    return "DESKTOP";
  }
  // Website / landing pages render in a desktop web viewport unless mobile is explicit above.
  if (wantsWebsiteDeliverable(message) || /\b(homepage|landing)\b/i.test(m)) return "DESKTOP";
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

/** Legacy Wireline product UI brief — only when the operator explicitly asks for Wireline surfaces. */
export const WIRELINE_STITCH_DESIGN_BRIEF =
  'Wireline "Aurora Cream" design system: paper #EFE9DC, ink #1A1614, brand #4F1E7B→#3B154C gradient CTAs, Fraunces italic headlines, Plus Jakarta Sans UI, JetBrains Mono labels (small caps, wide tracking). Sharp editorial corners (minimal radius), cream glass top shells, purple aurora-ring on active states. Premium B2B SaaS — production-ready, not generic AI-purple template.';

/** Legacy Wireline dark product UI brief — only for explicit Wireline dark-mode requests. */
export const WIRELINE_STITCH_DARK_DESIGN_BRIEF =
  'Wireline "Aurora Dark" design system: paper #0D0D11, ink #E2E8F0, brand #7C3AED→#4C1D95 gradient CTAs, Plus Jakarta Sans UI, JetBrains Mono labels (small caps, wide tracking). Sharp editorial corners (minimal radius), dark glassmorphism panels with 1px border-white/10 and backdrop-blur-md, purple aurora-glow on active states. Premium B2B SaaS dashboard — production-ready, dark mode, not generic AI-purple template.';

/** Default delivery rules for client-owned design renders (not Wireline product UI). */
export const CLIENT_STITCH_DELIVERY_BRIEF =
  "Design exclusively for the client's business, product, and audience. Never use Wireline branding, purple SaaS templates, or generic agent-dashboard aesthetics unless explicitly requested.\n\n" +
  "TYPOGRAPHY: Pair one distinctive display face (serif, slab, or condensed sans for headlines) with a highly readable geometric sans for UI text. Establish a clear scale: hero headlines 48–64px, section heads 28–36px, body 16–18px, microcopy 12–14px. Use weight contrast (display 700–800, body 400–500) rather than size alone to create hierarchy.\n\n" +
  "COLOR HIERARCHY: Build a cohesive palette from the client's industry and tone. Use one confident primary accent for CTAs and key actions. Neutrals should be warm or cool (not pure gray) — deep ink (#1a1a1a or soft charcoal) on light surfaces, or warm cream/off-white backgrounds. Surfaces should have subtle depth through very light tints or 1px borders, never flat Bootstrap gray.\n\n" +
  "SPACING & LAYOUT: All viewports are equally important. Treat mobile and desktop+laptop viewports as two separate focuses, both held to the highest standard of elegance. Use generous whitespace and a base 4–8px grid. Section padding should be 64–96px vertical on desktop, 40–64px on mobile. Let content breathe — crowded layouts feel cheap. Max content width ~1200px centered with auto margins.\n\n" +
  "COMPONENT PATTERNS: CTAs must be pill-shaped or softly rounded (8–12px radius) with high-contrast text. Cards should have subtle radius, light shadow or 1px border, and consistent internal padding (24–32px). Forms: large touch targets (min 44px height), clear labels, visible focus rings.\n\n" +
  "VISUAL TONE: Match the operator's described mood (warm, premium, playful, editorial, bold). Use purposeful imagery — realistic photography or custom abstract shapes, never generic stock-photo compositions. If no images are described, use bold typography and geometric accent shapes to create visual interest.\n\n" +
  "ACCESSIBILITY: WCAG AA contrast on all text. Semantic HTML elements (header, nav, main, section, footer). ARIA labels on icons and buttons. Keyboard-navigable focus states.\n\n" +
  "CONTENT: Write realistic, industry-specific copy. No lorem ipsum. Headlines should sell the benefit, not describe the feature.";

const WIRELINE_PRODUCT_SIGNAL =
  /\b(wireline\s+(?:director|mission\s+control|console|dashboard|app\s+ui|product\s+ui|aurora)|design\s+(?:the\s+)?wireline|wireline\s+design\s+system|aurora\s+cream)\b/i;

/** True when the operator is designing Wireline's own product surfaces (not a client deliverable). */
export function wantsWirelineProductDesign(message: string): boolean {
  return WIRELINE_PRODUCT_SIGNAL.test(message.trim());
}
