/**
 * Structured client design system — machine-readable tokens + human design.md sections.
 * Used for Wireline Design Studio client deliverables (not operator app UI).
 */
import {
  formatClientDesignPackForResearch,
  resolveClientDesignPack,
  type ClientDesignPack,
  type ClientDesignPackId,
} from "../data/client-design-packs";
import type { StitchDesignBrief } from "./director-stitch-brief";
import type { StitchTenantBranding } from "./director-stitch-branding";
import { wantsWirelineProductDesign } from "./director-stitch-intent";

export type ClientDesignFidelity = "high-fidelity" | "wireframe";

export interface ClientDesignTokens {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  primary: string;
  primaryContrast: string;
  accent: string;
  border: string;
  displayFont: string;
  uiFont: string;
  googleFontsUrl: string;
}

export interface ClientDesignSection {
  id: string;
  label: string;
  purpose: string;
  primaryCta?: string;
  kitClasses: string;
}

export interface ClientCopyBank {
  eyebrow: string;
  headline: string;
  subhead: string;
  primaryCta: string;
  secondaryCta?: string;
  trustBadges: string[];
}

export interface ClientDesignSystem {
  packId: ClientDesignPackId;
  packLabel: string;
  fidelity: ClientDesignFidelity;
  tokens: ClientDesignTokens;
  sections: ClientDesignSection[];
  copyBank: ClientCopyBank;
  accessibility: string[];
  copyTone: string;
  copyGuardrails?: string;
}

function resolvePrimaryColor(
  branding: StitchTenantBranding,
  useAccountBranding: boolean,
  pack: ClientDesignPack,
): string {
  if (useAccountBranding && branding.primaryColor?.trim()) {
    return branding.primaryColor.trim();
  }
  return pack.primaryHint;
}

function buildDefaultSections(brief: StitchDesignBrief, pack: ClientDesignPack): ClientDesignSection[] {
  const goal = brief.primaryGoal || "conversions";
  const primaryCta = pack.ctaVerbs[0] ?? "Call now";

  return [
    {
      id: "hero",
      label: "Hero",
      purpose: `Above-the-fold benefit headline for ${brief.audience || "local customers"}; drive ${goal}.`,
      primaryCta,
      kitClasses: "wl-hero wl-hero--photo (or typographic wl-hero), wl-headline, wl-subhead, wl-cta-row",
    },
    {
      id: "trust",
      label: "Trust row",
      purpose: "Immediate credibility pills below hero.",
      kitClasses: "wl-trust-row, wl-badge",
    },
    {
      id: "services",
      label: "Services / value props",
      purpose: "2–3 differentiated offers — not identical three-column grid.",
      kitClasses: "wl-section, wl-card",
    },
    {
      id: "proof",
      label: "Social proof or process",
      purpose: "Testimonial, rating, or 3-step how-it-works.",
      kitClasses: "wl-section, wl-testimonial or wl-stat",
    },
    {
      id: "cta-band",
      label: "Final CTA band",
      purpose: "Repeat primary action with urgency appropriate to industry.",
      primaryCta,
      kitClasses: "wl-section, wl-btn--primary",
    },
    {
      id: "footer",
      label: "Footer",
      purpose: "Business name, service area, contact, minimal legal.",
      kitClasses: "wl-footer",
    },
  ];
}

function buildCopyBank(
  brief: StitchDesignBrief,
  branding: StitchTenantBranding,
  pack: ClientDesignPack,
  useAccountBranding: boolean,
): ClientCopyBank {
  const name =
    brief.businessName ||
    (useAccountBranding ? branding.businessName || branding.brandName : "") ||
    brief.industry ||
    "Your business";
  const audience = brief.audience || "local customers";
  const industry = brief.industry || pack.label;

  const headlineByGoal: Record<string, string> = {
    bookings: `${name} — book your appointment today`,
    calls: `Trusted ${industry} — call for same-day help`,
    "quote requests": `Free estimates from ${name}`,
    leads: `${name} — get started in minutes`,
    conversions: `${name} — trusted by ${audience}`,
    onboarding: `Welcome to ${name}`,
    "sign-ups": `Join ${audience} who trust ${name}`,
  };

  const goalKey = brief.primaryGoal.toLowerCase();
  const headline =
    Object.entries(headlineByGoal).find(([k]) => goalKey.includes(k))?.[1] ??
    `${name} — built for ${audience}`;

  return {
    eyebrow: pack.trustBadges[0] ?? "Locally owned & trusted",
    headline,
    subhead: `Serving ${audience} with professional ${industry.toLowerCase()} — schedule online or call today.`,
    primaryCta: pack.ctaVerbs[0] ?? "Call now",
    secondaryCta: pack.ctaVerbs[1],
    trustBadges: pack.trustBadges.slice(0, 4),
  };
}

export function buildClientDesignSystem(input: {
  brief: StitchDesignBrief;
  branding: StitchTenantBranding;
  useAccountBranding: boolean;
  fidelity?: ClientDesignFidelity;
}): ClientDesignSystem {
  const { brief, branding, useAccountBranding } = input;
  const pack = resolveClientDesignPack({
    industry: brief.industry,
    businessType: branding.businessType ?? undefined,
    operatorMessage: brief.operatorRequest,
  });

  const primary = resolvePrimaryColor(branding, useAccountBranding, pack);
  const isDark =
    /\b(dark[\s-]?mode|dark[\s-]?theme|darker)\b/i.test(brief.operatorRequest) ||
    /\b(dark[\s-]?mode|dark[\s-]?theme|darker)\b/i.test(brief.styleNotes);

  const tokens: ClientDesignTokens = {
    bg: isDark ? "#0f1419" : pack.neutralBias === "warm" ? "#f7f3eb" : "#f4f7fb",
    surface: isDark ? "#1a2332" : "#ffffff",
    ink: isDark ? "#e8edf4" : "#0f172a",
    muted: isDark ? "#94a3b8" : "#475569",
    primary,
    primaryContrast: "#ffffff",
    accent: pack.accentHint,
    border: isDark ? "rgba(255,255,255,0.1)" : "rgba(15, 23, 42, 0.08)",
    displayFont: pack.displayFont,
    uiFont: pack.uiFont,
    googleFontsUrl: pack.googleFontsUrl,
  };

  return {
    packId: pack.id,
    packLabel: pack.label,
    fidelity: input.fidelity ?? "high-fidelity",
    tokens,
    sections: buildDefaultSections(brief, pack),
    copyBank: buildCopyBank(brief, branding, pack, useAccountBranding),
    accessibility: [
      "WCAG AA contrast on all text and buttons",
      "Semantic landmarks: header, main, footer",
      "ARIA labels on icon-only controls",
      "Visible focus rings on interactive elements",
      "Min 44px touch targets on CTAs",
    ],
    copyTone: brief.tone || `Professional ${pack.label.toLowerCase()} voice — local, trustworthy, American English`,
    copyGuardrails: pack.copyGuardrails,
  };
}

export function formatDesignTokensCssBlock(tokens: ClientDesignTokens): string {
  return [
    ":root {",
    `  --wl-bg: ${tokens.bg};`,
    `  --wl-surface: ${tokens.surface};`,
    `  --wl-ink: ${tokens.ink};`,
    `  --wl-muted: ${tokens.muted};`,
    `  --wl-primary: ${tokens.primary};`,
    `  --wl-primary-contrast: ${tokens.primaryContrast};`,
    `  --wl-accent: ${tokens.accent};`,
    `  --wl-border: ${tokens.border};`,
    `  --wl-font-display: ${tokens.displayFont};`,
    `  --wl-font-ui: ${tokens.uiFont};`,
    "}",
  ].join("\n");
}

export function formatDesignTokensMarkdown(system: ClientDesignSystem): string {
  const wirelineProduct = wantsWirelineProductDesign(system.copyBank.headline);
  if (wirelineProduct) {
    return "- Wireline product UI tokens apply — see Delivery section.";
  }

  return [
    `- Industry pack: ${system.packLabel} (${system.packId})`,
    `- Fidelity: ${system.fidelity}`,
    `- Google Fonts: ${system.tokens.googleFontsUrl}`,
    "",
    "```css",
    formatDesignTokensCssBlock(system.tokens),
    "```",
  ].join("\n");
}

export function formatSectionMapMarkdown(sections: ClientDesignSection[]): string {
  return sections
    .map(
      (s, i) =>
        `${i + 1}. **${s.label}** — ${s.purpose}` +
        (s.primaryCta ? ` CTA: "${s.primaryCta}".` : "") +
        ` Kit: ${s.kitClasses}.`,
    )
    .join("\n");
}

export function formatCopyBankMarkdown(copy: ClientCopyBank): string {
  const lines = [
    `- Eyebrow: ${copy.eyebrow}`,
    `- Headline: ${copy.headline}`,
    `- Subhead: ${copy.subhead}`,
    `- Primary CTA: ${copy.primaryCta}`,
  ];
  if (copy.secondaryCta) lines.push(`- Secondary CTA: ${copy.secondaryCta}`);
  lines.push(`- Trust badges: ${copy.trustBadges.join(" · ")}`);
  return lines.join("\n");
}

export function formatAccessibilityMarkdown(checklist: string[]): string {
  return checklist.map((item) => `- ${item}`).join("\n");
}

export function extractDesignTokensSection(markdown: string): string {
  const match = markdown.match(/## Design tokens[\s\S]*?(?=\n## |\n### Operator request|$)/i);
  return match?.[0]?.trim() ?? "";
}

export function formatPackContextForPipeline(system: ClientDesignSystem): string {
  const pack = resolveClientDesignPack({ industry: system.packLabel });
  return formatClientDesignPackForResearch(pack);
}
