/**
 * Pass-1 vision spec — Claude Design–style high-fidelity brief before the builder runs.
 * One exhaustive document (~5k chars) so the first HTML pass sees the full picture.
 */
import { resolveDesignPreviewDeviceType } from "./director-html-prototype";

/** Target length for the pass-1 builder user prompt block (vision + kit cues). */
export const DESIGN_VISION_SPEC_TARGET_CHARS = 5_000;

/** Soft floor — pad with section blueprints if synthesis runs short. */
export const DESIGN_VISION_SPEC_MIN_CHARS = 4_200;

export interface DesignVisionSpecInput {
  operatorMessage: string;
  designBriefMarkdown: string;
  opusVisionNotes?: string;
  researchNotes?: string;
  layoutScoutNotes?: string;
}

function deviceLabel(device: ReturnType<typeof resolveDesignPreviewDeviceType>): string {
  switch (device) {
    case "MOBILE":
      return "Mobile optimized, with a dual viewport layout ensuring desktop+laptop is equally elegant at full resolution (all viewports equally important)";
    case "TABLET":
      return "Tablet optimized layout, with seamless transition to both mobile and desktop screens (all viewports equally important)";
    case "DESKTOP":
      return "Desktop web optimized (max content ~1200px centered), ensuring mobile viewports are equally elegant and functional (all viewports equally important)";
    default:
      return "All viewports equally important (balanced dual-focus across mobile & desktop+laptop views)";
  }
}

function sectionBlueprint(device: string): string {
  return [
    "### Page structure guidance (adapt to Opus creative vision — do NOT force this exact order)",
    `- Viewport: ${device}`,
    "",
    "**Required elements** (place in the order that best serves the concept):",
    "- Hero section: bold, immersive, above-the-fold impact. Choose the hero TYPE that fits:",
    "  • Typographic hero: dramatic headline + gradient/color wash background",
    "  • Split hero: text left, visual/graphic right (or reversed)",
    "  • Photo hero: wl-hero--photo with scrim overlay",
    "  • Gradient hero: vivid multi-stop gradient with overlaid text",
    "- Trust signals: wl-trust-row with wl-badge pills (Licensed, Insured, Reviews, etc.)",
    "- Primary CTA: wl-btn wl-btn--primary (min 48px) — visible without scrolling on mobile and prominently presented on desktop/laptop",
    "- At least 2 content sections (services, process, testimonials, FAQ, about, etc.)",
    "- Footer with business info, contact, hours",
    "",
    "**Visual treatment direction** (choose what fits the brand):",
    "- Section surfaces: alternate between light, accent-tinted, and dark backgrounds",
    "- Card styles: elevated with shadow OR outlined with subtle border OR glassmorphism",
    "- Section dividers: gradient borders, curved SVG separators, or generous whitespace",
    "- Accent use: colored underlines, pill badges, icon tints, gradient text on headlines",
    "",
    "**If Opus creative vision specifies a different section order or layout, FOLLOW OPUS — not this template.**",
  ].join("\n");
}

function antiPatternsBlock(): string {
  return [
    "## Anti-patterns (never ship)",
    "- Generic AI purple gradients or Wireline Aurora branding unless explicitly requested",
    "- Bare <a href> text links as the primary CTA",
    "- Lorem ipsum or placeholder Latin",
    "- External-only CSS (preview requires embedded <style>)",
    "- Three identical feature cards in a row with no visual hierarchy",
    "- Headlines that describe features instead of customer outcomes",
    "- Missing trust signals for local service businesses",
  ].join("\n");
}

function successCriteria(): string {
  return [
    "## Success criteria (pass 1 must satisfy)",
    "- Single complete HTML document with embedded Wireline kit CSS",
    "- Hero + trust row + at least one content section + footer",
    "- Primary CTA visible without scrolling on mobile, and prominently positioned on desktop/laptop views",
    "- WCAG AA contrast on text and buttons",
    "- Copy reads American English, local-business idioms (call now, free estimate, licensed & insured)",
    "- Distinctive typography pairing — not a template clone",
  ].join("\n");
}

function padToTarget(text: string, target: number): string {
  let out = text;
  const paddingBlocks = [
    [
      "## Additional layout notes",
      "- Use generous vertical rhythm: 64–96px section padding on desktop, 40–64px mobile",
      "- Let the hero breathe — avoid cramming badges, headline, and form into one tight block",
      "- Photography: if hero image slots exist, leave wl-hero-bg ready for background-image",
      "- Focus states: visible outline on buttons and links for keyboard users",
      "- prefers-reduced-motion: respect in CSS if adding transitions",
    ].join("\n"),
    [
      "## Microcopy patterns (US SMB)",
      "- CTAs: Call now, Get a free estimate, Schedule service, Request a quote",
      "- Trust: Licensed & insured, Locally owned, Same-day service, 5-star rated",
      "- Urgency (when appropriate): Limited availability this week, 24/7 emergency line",
    ].join("\n"),
    [
      "## Typography execution",
      "- Display face for wl-headline only; UI sans for body, buttons, badges",
      "- Eyebrow: uppercase, letter-spaced, accent color — one line max",
      "- Subhead: 18–20px, muted ink, max 2 lines on mobile",
      "- Button labels: verb-first, 2–4 words (Call now, Get my estimate)",
    ].join("\n"),
    [
      "## Color execution",
      "- Set --wl-primary and --wl-accent in :root from industry and tone in design.md",
      "- Surfaces: --wl-bg page wash, --wl-surface for cards, 1px --wl-border separators",
      "- Never pure #000 text — use deep ink with slight warmth or cool cast",
    ].join("\n"),
  ];

  for (const block of paddingBlocks) {
    if (out.length >= DESIGN_VISION_SPEC_MIN_CHARS) break;
    out = `${out}\n\n${block}`;
  }

  while (out.length < DESIGN_VISION_SPEC_MIN_CHARS) {
    out = `${out}\n- Ship section completeness: hero, trust, services, proof, CTA band, footer.`;
  }

  return out.slice(0, target + 400);
}

/**
 * Synthesize the pass-1 vision document — no extra LLM call; assembled from brief + research.
 */
export function buildDesignVisionSpec(input: DesignVisionSpecInput): string {
  const device = resolveDesignPreviewDeviceType({
    operatorMessage: input.operatorMessage,
    designBriefMarkdown: input.designBriefMarkdown,
  });

  const parts = [
    "# Wireline Design Vision Spec",
    "",
    "## Studio mode",
    "High-fidelity production landing page (not wireframe). Output one self-contained HTML file with embedded <style>.",
    "This spec is the single source of truth for pass 1 — implement every section below.",
    "",
    "## Viewport & canvas",
    deviceLabel(device),
    "",
    "## Operator intent (verbatim)",
    input.operatorMessage.trim(),
    "",
    "## design.md (project brief — honor every field)",
    input.designBriefMarkdown.trim(),
  ];

  if (input.opusVisionNotes?.trim()) {
    parts.push("", "## Opus creative vision (authoritative)", input.opusVisionNotes.trim());
  }

  if (input.researchNotes?.trim()) {
    parts.push("", "## Research synthesis (follow closely)", input.researchNotes.trim());
  }

  if (input.layoutScoutNotes?.trim()) {
    parts.push(
      "",
      "## Layout archetypes (pick one or hybridize — avoid generic grids)",
      input.layoutScoutNotes.trim(),
    );
  }

  parts.push(
    "",
    "## Section-by-section blueprint",
    sectionBlueprint(deviceLabel(device)),
    "",
    antiPatternsBlock(),
    "",
    successCriteria(),
  );

  return padToTarget(parts.join("\n"), DESIGN_VISION_SPEC_TARGET_CHARS);
}

export function visionSpecCharCount(spec: string): number {
  return spec.length;
}
