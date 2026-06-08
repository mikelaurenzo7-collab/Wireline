/**
 * Industry design packs for client-facing Wireline Design deliverables (US SMB).
 * Each pack supplies typography, palette bias, trust vocabulary, and copy guardrails.
 */

export type ClientDesignPackId =
  | "hvac"
  | "plumbing"
  | "dental"
  | "legal"
  | "home-services"
  | "med-spa"
  | "restaurant"
  | "real-estate"
  | "general";

export interface ClientDesignPack {
  id: ClientDesignPackId;
  label: string;
  keywords: RegExp;
  displayFont: string;
  uiFont: string;
  googleFontsUrl: string;
  neutralBias: "warm" | "cool";
  primaryHint: string;
  accentHint: string;
  heroPattern: "photo" | "typographic" | "either";
  trustBadges: string[];
  ctaVerbs: string[];
  copyGuardrails?: string;
  photographyDirection: string;
}

export const CLIENT_DESIGN_PACKS: readonly ClientDesignPack[] = [
  {
    id: "hvac",
    label: "HVAC & climate",
    keywords: /\b(hvac|heating|cooling|air\s+condition|furnace|ac\s+repair)\b/i,
    displayFont: '"Libre Baskerville", Georgia, serif',
    uiFont: '"DM Sans", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Libre+Baskerville:wght@700&display=swap",
    neutralBias: "cool",
    primaryHint: "#1e3a5f",
    accentHint: "#c47f3a",
    heroPattern: "photo",
    trustBadges: ["Licensed & insured", "Same-day service", "24/7 emergency", "Local family-owned"],
    ctaVerbs: ["Call now", "Schedule service", "Get a free estimate"],
    photographyDirection:
      "Clean residential HVAC equipment, technician at work (no faces), cool blue hour lighting.",
  },
  {
    id: "plumbing",
    label: "Plumbing",
    keywords: /\b(plumb|drain|sewer|water\s+heater|pipe)\b/i,
    displayFont: '"Fraunces", Georgia, serif',
    uiFont: '"DM Sans", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Fraunces:opsz,wght@9..144,700&display=swap",
    neutralBias: "warm",
    primaryHint: "#0f4c5c",
    accentHint: "#e07a2f",
    heroPattern: "photo",
    trustBadges: ["Licensed plumbers", "Upfront pricing", "Emergency line", "Satisfaction guaranteed"],
    ctaVerbs: ["Call now", "Request a quote", "Book a plumber"],
    photographyDirection: "Modern bathroom or kitchen fixture, copper pipes, warm natural light.",
  },
  {
    id: "dental",
    label: "Dental & oral health",
    keywords: /\b(dental|dentist|orthodont|oral|teeth|smile)\b/i,
    displayFont: '"Playfair Display", Georgia, serif',
    uiFont: '"Nunito Sans", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700&family=Playfair+Display:wght@700&display=swap",
    neutralBias: "cool",
    primaryHint: "#0d5c63",
    accentHint: "#6ec6ca",
    heroPattern: "either",
    trustBadges: ["Accepting new patients", "Gentle care", "Insurance accepted", "5-star reviews"],
    ctaVerbs: ["Book appointment", "Call the office", "New patient form"],
    copyGuardrails:
      "No guaranteed treatment outcomes. Use educational tone; avoid before/after promises.",
    photographyDirection: "Bright, airy dental office interior — clean, welcoming, no graphic procedures.",
  },
  {
    id: "legal",
    label: "Legal services",
    keywords: /\b(legal|law\s+firm|attorney|lawyer|litigation|injury)\b/i,
    displayFont: '"Cormorant Garamond", Georgia, serif',
    uiFont: '"Source Sans 3", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap",
    neutralBias: "cool",
    primaryHint: "#1a2332",
    accentHint: "#b8860b",
    heroPattern: "typographic",
    trustBadges: ["Free consultation", "No fee unless we win", "Local counsel", "Confidential"],
    ctaVerbs: ["Free case review", "Call our office", "Schedule consultation"],
    copyGuardrails:
      "No outcome guarantees. Include disclaimer that results vary. Do not impersonate a law firm.",
    photographyDirection: "Subtle courthouse or library textures — authoritative, not stock-handshake cliché.",
  },
  {
    id: "home-services",
    label: "Home services",
    keywords:
      /\b(cleaning|landscap|roofing|contractor|handyman|pest|window|gutter|pressure\s+wash)\b/i,
    displayFont: '"Fraunces", Georgia, serif',
    uiFont: '"DM Sans", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Fraunces:opsz,wght@9..144,700&display=swap",
    neutralBias: "warm",
    primaryHint: "#2d4a3e",
    accentHint: "#d4a054",
    heroPattern: "photo",
    trustBadges: ["Licensed & insured", "Background-checked", "Locally owned", "Free estimates"],
    ctaVerbs: ["Get a free estimate", "Call now", "Book service"],
    photographyDirection: "Finished home exterior or tidy job site — aspirational curb appeal.",
  },
  {
    id: "med-spa",
    label: "Med spa & aesthetics",
    keywords: /\b(med\s*spa|aesthetic|botox|skincare|wellness\s+clinic|cosmetic)\b/i,
    displayFont: '"Cormorant", Georgia, serif',
    uiFont: '"Jost", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Cormorant:wght@600;700&family=Jost:wght@400;500;600&display=swap",
    neutralBias: "warm",
    primaryHint: "#4a3728",
    accentHint: "#c9a87c",
    heroPattern: "photo",
    trustBadges: ["Board-certified", "Personalized consults", "Medical-grade", "By appointment"],
    ctaVerbs: ["Book consultation", "Call the spa", "View services"],
    copyGuardrails: "No guaranteed aesthetic outcomes. Consult-required language for procedures.",
    photographyDirection: "Soft spa interior, natural textures — luxurious but clinical credibility.",
  },
  {
    id: "restaurant",
    label: "Restaurant & hospitality",
    keywords: /\b(restaurant|cafe|bistro|bar\s+and\s+grill|food\s+truck|catering)\b/i,
    displayFont: '"Libre Baskerville", Georgia, serif',
    uiFont: '"Karla", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Karla:wght@400;600;700&family=Libre+Baskerville:wght@700&display=swap",
    neutralBias: "warm",
    primaryHint: "#3d2314",
    accentHint: "#c45c26",
    heroPattern: "photo",
    trustBadges: ["Farm-to-table", "Reservations welcome", "Family recipes", "Local favorite"],
    ctaVerbs: ["Reserve a table", "View menu", "Order online"],
    photographyDirection: "Hero food or dining room — warm lighting, appetizing but not greasy stock.",
  },
  {
    id: "real-estate",
    label: "Real estate",
    keywords: /\b(real\s+estate|realtor|broker|property|homes?\s+for\s+sale)\b/i,
    displayFont: '"Cormorant Garamond", Georgia, serif',
    uiFont: '"Inter", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;600&display=swap",
    neutralBias: "cool",
    primaryHint: "#1c2b3a",
    accentHint: "#8b7355",
    heroPattern: "photo",
    trustBadges: ["Local market expert", "Buyer & seller agent", "Neighborhood specialist", "Trusted advisor"],
    ctaVerbs: ["Schedule a showing", "Get home value", "Contact agent"],
    photographyDirection: "Residential exterior at golden hour — aspirational but realistic.",
  },
  {
    id: "general",
    label: "General local business",
    keywords: /.^/,
    displayFont: '"Fraunces", Georgia, serif',
    uiFont: '"DM Sans", system-ui, sans-serif',
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Fraunces:opsz,wght@9..144,700&display=swap",
    neutralBias: "warm",
    primaryHint: "#1e3a5f",
    accentHint: "#c47f3a",
    heroPattern: "either",
    trustBadges: ["Licensed & insured", "Locally owned", "5-star rated", "Free estimates"],
    ctaVerbs: ["Call now", "Get started", "Request a quote"],
    photographyDirection: "Industry-appropriate local business scene with negative space for headline overlay.",
  },
] as const;

/** Resolve the best industry pack from business type, industry string, or operator message. */
export function resolveClientDesignPack(input: {
  industry?: string;
  businessType?: string;
  operatorMessage?: string;
}): ClientDesignPack {
  const corpus = [input.businessType, input.industry, input.operatorMessage]
    .filter(Boolean)
    .join(" ")
    .trim();

  for (const pack of CLIENT_DESIGN_PACKS) {
    if (pack.id === "general") continue;
    if (pack.keywords.test(corpus)) return pack;
  }
  return CLIENT_DESIGN_PACKS.find((p) => p.id === "general")!;
}

export function formatClientDesignPackForResearch(pack: ClientDesignPack): string {
  return [
    `Industry pack: ${pack.label}`,
    `Typography: ${pack.displayFont} (display) + ${pack.uiFont} (UI)`,
    `Palette bias: ${pack.neutralBias} neutrals; primary ~${pack.primaryHint}, accent ~${pack.accentHint}`,
    `Hero: ${pack.heroPattern}`,
    `Trust badges: ${pack.trustBadges.join(", ")}`,
    `CTA verbs: ${pack.ctaVerbs.join(", ")}`,
    pack.copyGuardrails ? `Guardrails: ${pack.copyGuardrails}` : "",
    `Photography: ${pack.photographyDirection}`,
  ]
    .filter(Boolean)
    .join("\n");
}
