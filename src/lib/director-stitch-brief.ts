/**
 * Stitch design brief — tenant branding, design.md, and clarifying questions
 * before Wireline Design renders screens.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { isSsrfUrl } from "./webhook-validators";
import {
  CLIENT_STITCH_DELIVERY_BRIEF,
  WIRELINE_STITCH_DARK_DESIGN_BRIEF,
  WIRELINE_STITCH_DESIGN_BRIEF,
  wantsStitchMediaRequest,
  wantsWirelineProductDesign,
} from "./director-stitch-intent";
import type { StitchMediaOperation } from "./director-stitch-intent";
import {
  buildClientDesignSystem,
  formatAccessibilityMarkdown,
  formatCopyBankMarkdown,
  formatDesignTokensMarkdown,
  formatSectionMapMarkdown,
  type ClientDesignSystem,
} from "./client-design-system";
import {
  hasConfiguredTenantBranding,
  resolveUseAccountBranding,
  type StitchBriefOptions,
  type StitchTenantBranding,
} from "./director-stitch-branding";

export type { StitchBriefOptions, StitchTenantBranding };
export { hasConfiguredTenantBranding, resolveUseAccountBranding };

export interface StitchDesignBrief {
  businessName: string;
  industry: string;
  audience: string;
  primaryGoal: string;
  tone: string;
  pages: string;
  operatorRequest: string;
  styleNotes: string;
}

export type StitchBriefField = "business" | "audience" | "goal" | "pages";

const INDUSTRY_RE =
  /\b(hvac|plumbing|roofing|legal|law\s+firm|dental|medical|real\s+estate|restaurant|cleaning|landscaping|insurance|saas|contractor|home\s+services|auto\s+repair|salon|fitness|accounting|meditation|wellness|mindfulness)\b/i;

const AUDIENCE_RE =
  /\b(homeowners?|businesses?|b2b|b2c|consumers?|patients?|tenants?|buyers?|sellers?|families|contractors?|operators?|founders?|small\s+business)\b/i;

const GOAL_RE =
  /\b(bookings?|appointments?|leads?|calls?|conversions?|sign[\s-]?ups?|demo\s+requests?|quote\s+requests?|sales|brand\s+awareness|showcase|portfolio)\b/i;

/** CTAs and hyphenated variants that GOAL_RE misses (e.g. book-now). */
const GOAL_CTA_RE =
  /\b(book[\s-]?now|book\s+a\b|schedule(?:\s+a)?\b|get\s+(?:a\s+)?quote|request\s+(?:a\s+)?quote|call\s+(?:us|now)|contact\s+(?:us|form)|sign[\s-]?up|get\s+started|onboarding|cta|call[\s-]?to[\s-]?action)\b/i;

const LANDING_SECTION_RE =
  /\b(hero|services?|testimonials?|pricing|about|contact|faq|footer|features?|portfolio|gallery|how\s+it\s+works|team|reviews?)\b/i;

/** Default audience when the operator names an industry but not a segment. */
const INDUSTRY_AUDIENCE: Readonly<Record<string, string>> = {
  cleaning: "homeowners",
  plumbing: "homeowners",
  hvac: "homeowners",
  roofing: "homeowners",
  landscaping: "homeowners",
  contractor: "homeowners",
  "home services": "homeowners",
  dental: "patients",
  medical: "patients",
  legal: "businesses",
  "law firm": "businesses",
  "real estate": "buyers and sellers",
  restaurant: "local diners",
  insurance: "consumers",
  saas: "SMB operators",
  salon: "local customers",
  fitness: "local members",
  accounting: "small businesses",
  "auto repair": "vehicle owners",
};

const TONE_RE =
  /\b(trustworthy|premium|friendly|playful|professional|modern|minimal|editorial|warm|bold|luxury|approachable)\b/i;

const PAGE_LIST_RE =
  /\b((?:\d+\s+)?pages?|home(?:page)?|about|contact|services?|pricing|blog|faq|booking|portfolio)\b/i;

export async function loadStitchTenantBranding(userId: string): Promise<StitchTenantBranding> {
  const [row] = await drizzle
    .select({
      brandName: schema.settings.brandName,
      brandLogoUrl: schema.settings.brandLogoUrl,
      primaryColor: schema.settings.primaryColor,
      businessName: schema.settings.businessName,
      businessType: schema.settings.businessType,
      primaryProduct: schema.settings.primaryProduct,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  return {
    brandName: row?.brandName?.trim() || null,
    brandLogoUrl: row?.brandLogoUrl?.trim() || null,
    primaryColor: row?.primaryColor?.trim() || null,
    businessName: row?.businessName?.trim() || null,
    businessType: row?.businessType?.trim() || null,
    primaryProduct: row?.primaryProduct?.trim() || null,
  };
}

function safeBrandingLogoUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("https://")) return null;
  if (isSsrfUrl(trimmed)) return null;
  return trimmed;
}

function pickMatch(text: string, re: RegExp): string {
  const m = text.match(re);
  return m?.[0]?.trim() ?? "";
}

function inferBusinessName(text: string, branding: StitchTenantBranding): string {
  const calledMatch = text.match(
    /\b(?:called|named)\s+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,3})/i,
  );
  if (calledMatch?.[1]) return calledMatch[1].trim();
  const forMatch = text.match(/\bfor\s+([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,4})/);
  if (forMatch?.[1]) return forMatch[1].trim();
  const companyMatch = text.match(
    /\b([A-Z][\w&'.-]+(?:\s+[A-Z][\w&'.-]+){0,3}\s+(?:Company|Co\.|LLC|Inc\.|Group|Services|Cleaning|Plumbing|Dental|Law))\b/,
  );
  if (companyMatch?.[1]) return companyMatch[1].trim();
  if (branding.businessName) return branding.businessName;
  if (branding.brandName && branding.brandName.toLowerCase() !== "wireline") {
    return branding.brandName;
  }
  return "";
}

function inferAudience(corpus: string, industry: string): string {
  const direct = pickMatch(corpus, AUDIENCE_RE);
  if (direct) return direct;
  const normalizedIndustry = industry.trim().toLowerCase();
  if (normalizedIndustry) {
    for (const [key, audience] of Object.entries(INDUSTRY_AUDIENCE)) {
      if (normalizedIndustry.includes(key)) return audience;
    }
  }
  if (/\b(b2b|enterprise|saas|platform|software)\b/i.test(corpus)) return "SMB operators";
  if (/\b(local|neighborhood|community)\b/i.test(corpus)) return "local customers";
  return "";
}

function inferPrimaryGoal(corpus: string): string {
  if (/\bonboarding\b/i.test(corpus)) return "onboarding";
  const direct = pickMatch(corpus, GOAL_RE);
  if (direct) return direct;
  if (GOAL_CTA_RE.test(corpus)) {
    if (/\b(book|schedule|appointment)\b/i.test(corpus)) return "bookings";
    if (/\bquote\b/i.test(corpus)) return "quote requests";
    if (/\bcall\b/i.test(corpus)) return "calls";
    if (/\b(contact|lead)\b/i.test(corpus)) return "leads";
    if (/\bsign[\s-]?up\b/i.test(corpus)) return "sign-ups";
    return "conversions";
  }
  if (/\blanding\s+page\b/i.test(corpus) && LANDING_SECTION_RE.test(corpus)) {
    return "conversions";
  }
  return "";
}

function inferPages(corpus: string, operatorMessage: string): string {
  if (PAGE_LIST_RE.test(corpus)) {
    return (
      corpus
        .split("\n")
        .find((line) => PAGE_LIST_RE.test(line))
        ?.trim()
        .slice(0, 240) || pickMatch(corpus, PAGE_LIST_RE)
    );
  }
  const sections = [
    ...new Set(
      [...operatorMessage.matchAll(new RegExp(LANDING_SECTION_RE.source, "gi"))].map((m) =>
        m[0].toLowerCase(),
      ),
    ),
  ];
  if (sections.length >= 2) {
    return `Single-page landing: ${sections.join(", ")}`;
  }
  if (/\blanding\s+page\b/i.test(corpus)) {
    return "Single-page landing (from operator request)";
  }
  return "";
}

export function parseStitchDesignBrief(
  operatorMessage: string,
  history: Array<{ role: "operator" | "director"; content: string }>,
  branding: StitchTenantBranding,
): StitchDesignBrief {
  const corpus = [...history.slice(-10).map((h) => h.content), operatorMessage].join("\n");
  const industry =
    branding.businessType?.trim() ||
    pickMatch(corpus, INDUSTRY_RE) ||
    pickMatch(operatorMessage, INDUSTRY_RE);
  const businessName = inferBusinessName(corpus, branding);
  const audience = inferAudience(corpus, industry);
  const primaryGoal = inferPrimaryGoal(corpus);
  const tone = pickMatch(corpus, TONE_RE);
  const pages = inferPages(corpus, operatorMessage);

  const styleBits: string[] = [];
  if (tone) styleBits.push(`Tone: ${tone}`);
  if (branding.primaryProduct) styleBits.push(`Offer: ${branding.primaryProduct}`);

  const originalRequest =
    history.map((h) => h.content).find((content) => wantsStitchMediaRequest(content)) ||
    operatorMessage;

  return {
    businessName,
    industry,
    audience,
    primaryGoal,
    tone,
    pages,
    operatorRequest: originalRequest.trim(),
    styleNotes: styleBits.join(" · "),
  };
}

export function missingStitchBriefFields(
  brief: StitchDesignBrief,
  operation: StitchMediaOperation,
  hasSession: boolean,
  options?: { designMode?: boolean },
): StitchBriefField[] {
  if (hasSession && (operation === "edit" || operation === "variants")) return [];

  if (
    options?.designMode &&
    brief.operatorRequest.trim().length >= 12 &&
    operation !== "build_site"
  ) {
    return [];
  }

  const missing: StitchBriefField[] = [];
  if (!brief.businessName && !brief.industry) missing.push("business");
  if (!brief.audience) missing.push("audience");
  if (!brief.primaryGoal) missing.push("goal");
  if (operation === "build_site" && !brief.pages) missing.push("pages");
  return missing;
}

export function stitchClarifyingQuestions(missing: StitchBriefField[]): string[] {
  return missing.map((field) => {
    switch (field) {
      case "business":
        return "What business or industry is this for?";
      case "audience":
        return "Who is the primary audience (e.g. homeowners, SMB operators)?";
      case "goal":
        return "What should visitors do — book, call, request a quote, or something else?";
      case "pages":
        return "Which pages should the site include (home, services, about, contact, etc.)?";
      default:
        return "Can you share one more detail so I can nail the design?";
    }
  });
}

function typographyFromBranding(useBranding: boolean, operatorRequest: string): string {
  if (wantsWirelineProductDesign(operatorRequest)) {
    return "Plus Jakarta Sans for UI, Fraunces italic for display headlines, JetBrains Mono for labels.";
  }
  if (useBranding) {
    return "Readable sans for UI with one distinctive display face matched to the client's industry and tone. Scale: hero 48–64px, section heads 28–36px, body 16–18px.";
  }
  return "Choose readable sans for UI with one distinctive display face — avoid generic Inter-only stacks. Scale: hero 48–64px, section heads 28–36px, body 16–18px.";
}

function colorSection(
  branding: StitchTenantBranding,
  useBranding: boolean,
  brief: StitchDesignBrief,
): string {
  if (useBranding && (branding.primaryColor || branding.brandLogoUrl)) {
    const lines = [`- Primary accent: ${branding.primaryColor || "infer from industry"}`];
    const logoUrl = safeBrandingLogoUrl(branding.brandLogoUrl);
    if (logoUrl) lines.push(`- Logo reference: ${logoUrl}`);
    lines.push("- Neutrals and surfaces: infer from industry and tone in the operator request");
    return lines.join("\n");
  }
  if (brief.tone) {
    return `- Infer palette from tone (${brief.tone}) and industry — cohesive surfaces, one confident accent, warm or cool neutrals (avoid pure gray and generic AI purple).`;
  }
  return `- Infer a cohesive palette from the request — one confident accent, warm or cool neutrals, subtle surface depth. Never use generic AI-purple or flat Bootstrap gray.`;
}

export function buildStitchDesignMarkdown(input: {
  brief: StitchDesignBrief;
  branding: StitchTenantBranding;
  useAccountBranding: boolean;
  designSystem?: ClientDesignSystem;
  designProfileSection?: string;
}): string {
  const { brief, branding, useAccountBranding } = input;
  const clientDesignSystem =
    input.designSystem ?? buildClientDesignSystem({ brief, branding, useAccountBranding });
  const title = brief.businessName || brief.industry || "Design project";
  const brandLine = useAccountBranding
    ? branding.brandName || branding.businessName || title
    : title;

  const brandingSourceLine = useAccountBranding
    ? "Client account brand kit (Admin → Branding) merged with the operator request."
    : "Prompt-derived visual system from the operator request (no saved account branding).";

  const isDark =
    /\b(dark[\s-]?mode|dark[\s-]?theme|darker)\b/i.test(brief.operatorRequest) ||
    /\b(dark[\s-]?mode|dark[\s-]?theme|darker)\b/i.test(brief.styleNotes);
  const wirelineProduct = wantsWirelineProductDesign(brief.operatorRequest);
  const deliveryBrief = wirelineProduct
    ? isDark
      ? WIRELINE_STITCH_DARK_DESIGN_BRIEF
      : WIRELINE_STITCH_DESIGN_BRIEF
    : CLIENT_STITCH_DELIVERY_BRIEF;

  const surfacesLine = wirelineProduct
    ? isDark
      ? "dark UI surfaces, premium dark-mode"
      : "warm cream paper, sharp editorial corners, accessible contrast"
    : isDark
      ? "dark UI surfaces matched to the client's industry"
      : "surfaces and contrast matched to the client's industry and tone";

  return [
    `# Design brief — ${title}`,
    "",
    "## Brand",
    `- Name: ${brandLine}`,
    colorSection(branding, useAccountBranding, brief),
    `- Source: ${brandingSourceLine}`,
    "",
    input.designProfileSection ? input.designProfileSection : "",
    input.designProfileSection ? "" : "",
    "## Product context",
    `- Industry: ${brief.industry || "—"}`,
    `- Audience: ${brief.audience || "—"}`,
    `- Primary goal: ${brief.primaryGoal || "—"}`,
    brief.styleNotes ? `- Notes: ${brief.styleNotes}` : "",
    "",
    "## Visual system",
    `- Typography: ${typographyFromBranding(useAccountBranding, brief.operatorRequest)}`,
    `- Surfaces: ${surfacesLine}`,
    `- Spacing: generous whitespace, 4–8px base grid, 64–96px section padding desktop / 40–64px mobile, max-width ~1200px centered`,
    `- Components: pill or softly rounded CTAs (8–12px radius) with high-contrast text; cards with subtle radius, light shadow or 1px border, 24–32px internal padding; forms with 44px+ touch targets and visible focus rings`,
    `- Imagery: realistic photography or custom abstract shapes; if no images described, use bold typography and geometric accent shapes instead of generic stock layouts`,
    `- Mood: ${brief.tone || "infer from industry and operator request — be bold and bespoke, never template-like"}`,
    `- Responsive: mobile-first unless desktop/web is explicitly requested`,
    "",
    "## Design tokens",
    formatDesignTokensMarkdown(clientDesignSystem),
    "",
    "## Section map",
    formatSectionMapMarkdown(clientDesignSystem.sections),
    "",
    "## Copy bank",
    formatCopyBankMarkdown(clientDesignSystem.copyBank),
    clientDesignSystem.copyGuardrails ? `- Guardrails: ${clientDesignSystem.copyGuardrails}` : "",
    "",
    "## Accessibility",
    formatAccessibilityMarkdown(clientDesignSystem.accessibility),
    "",
    "## Screen scope",
    brief.pages ? `- Pages: ${brief.pages}` : "- Pages: infer from the operator request",
    "",
    "### Operator request",
    brief.operatorRequest,
    "",
    "## Delivery",
    deliveryBrief,
    "Ship semantic HTML with one <style> block, accessible labels, and production-ready spacing.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function buildStitchClarifyReply(
  missing: StitchBriefField[],
  designMarkdown: string,
  useAccountBranding: boolean,
): string {
  const brandingNote = useAccountBranding
    ? "I pulled your account branding into the draft brief below."
    : "I'll infer the visual system from your answers (account branding is off for this render).";
  const need = missing.join(", ");
  return [
    `Before I generate screens, I need a bit more context (${need}). ${brandingNote}`,
    "",
    "Reply with the missing details — tap a question below or type your own.",
    "",
    "```markdown",
    designMarkdown,
    "```",
  ].join("\n");
}

export function buildStitchDesignBriefArtifact(
  markdown: string,
  meta?: { projectId?: string },
): Record<string, unknown> {
  return {
    toolName: "wireline_design_studio",
    artifactType: "design-brief",
    legacyArtifactType: "stitch-design-brief",
    name: "design.md",
    mimeType: "text/markdown",
    content: markdown,
    ...(meta?.projectId ? { projectId: meta.projectId } : {}),
  };
}

/** Normalize brief artifact type from persisted or legacy metadata. */
export function isDesignBriefArtifactType(artifactType: string): boolean {
  return artifactType === "design-brief" || artifactType === "stitch-design-brief";
}
