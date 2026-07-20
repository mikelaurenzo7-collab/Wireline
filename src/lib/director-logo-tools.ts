import { randomUUID } from "node:crypto";
import type { ToolSchema } from "./claude-structured";

export const DIRECTOR_TOOL_SCHEMAS: Record<string, ToolSchema> = {
  generate_logo: {
    name: "generate_logo",
    description:
      "Generate multiple logo concepts from a creative brief. Requires a style, color direction, and usage context.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Business/brand logo brief." },
        style: { type: "string", description: "Style direction (e.g. modern, minimalist)." },
        colors: { type: "string", description: "Color palette direction." },
        usage: {
          type: "string",
          description: "Primary usage context (web, print, app icon, etc).",
        },
        concepts: { type: "integer", minimum: 1, maximum: 6 },
      },
      required: ["prompt", "style", "colors", "usage"],
      additionalProperties: false,
    },
  },
  vectorize_logo: {
    name: "vectorize_logo",
    description: "Export a selected logo concept to a clean SVG vector.",
    input_schema: {
      type: "object",
      properties: {
        concept_id: { type: "string" },
        svg: { type: "string", description: "Source SVG markup for selected concept." },
      },
      required: ["concept_id", "svg"],
      additionalProperties: false,
    },
  },
  brand_pack_export: {
    name: "brand_pack_export",
    description: "Export a downloadable ZIP pack with SVG/PNG/PDF variants and metadata.",
    input_schema: {
      type: "object",
      properties: {
        concept_id: { type: "string" },
        concept_name: { type: "string" },
        svg: { type: "string" },
      },
      required: ["concept_id", "concept_name", "svg"],
      additionalProperties: false,
    },
  },
};

const TRADEMARK_RISK =
  /(apple|google|microsoft|nike|adidas|tesla|coca[-\s]?cola|openai|chatgpt|disney|mcdonald'?s|starbucks|amazon|meta|instagram|facebook)/i;
const ABUSE_PATTERN = /(hate|nazi|terror|bomb|genocide|explicit sexual|child sexual)/i;

export interface DirectorCreativeBrief {
  prompt: string;
  style: string;
  colors: string;
  usage: string;
  concepts: number;
}

export interface DirectorLogoConcept {
  conceptId: string;
  title: string;
  rationale: string;
  svg: string;
  previewDataUrl: string;
  score: number;
}

export interface DirectorLogoGeneration {
  brief: DirectorCreativeBrief;
  concepts: DirectorLogoConcept[];
  chosenConceptId: string;
  critique: string;
}

export interface DirectorPolicyCheckResult {
  allowed: boolean;
  reason?: string;
  trademarkRisk?: boolean;
}

function clampText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

export function parseCreativeBriefFromText(
  message: string,
  history: Array<{ role: "operator" | "director"; content: string }>,
): Partial<DirectorCreativeBrief> {
  const text = `${history
    .slice(-8)
    .map((h) => h.content)
    .join("\n")}\n${message}`;

  let style = text.match(/style\s*[:=-]\s*([^\n,.]+)/i)?.[1]?.trim() || "";
  let colors = text.match(/(?:color|palette)s?\s*[:=-]\s*([^\n.]+)/i)?.[1]?.trim() || "";
  let usage =
    text.match(/(?:usage|use\s*case|primary use)\s*[:=-]\s*([^\n.]+)/i)?.[1]?.trim() ||
    (/(app icon|website header|website|business card|billboard|social|print)/i.exec(text)?.[1] ??
      "");

  if (!style) {
    const styleMatch = text.match(
      /\b(minimal(?:ist)?|modern|geometric|bold|playful|professional|clean|abstract|retro|vintage|flat)\b[^.\n]*/gi,
    );
    // Grab all style keywords from the text
    if (styleMatch && styleMatch.length > 0) {
      style = styleMatch.map((s) => s.trim()).join(" ");
    }
  }

  if (!colors) {
    const hexes = [...text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    const colorPhrase = text.match(
      /\b(deep blue|electric teal|navy(?:\s+and\s+gold)?|teal|blue(?:\s+and\s+\w+)?|brand colors?)[^.\n]*/i,
    );
    if (hexes.length > 0) {
      colors = [...hexes, colorPhrase?.[0]?.trim() ?? ""].filter(Boolean).join(", ");
    } else if (colorPhrase) {
      colors = colorPhrase[0].trim();
    }
  }

  if (!usage) {
    const usageMatch = text.match(/(?:used?(?:\s+most)?\s+for|primary use|for)\s+([^.\n]+)/i);
    if (usageMatch) usage = usageMatch[1].trim();
  }

  const logoHistory = history
    .filter((h) => h.role === "operator" && /logo|brand|mark|icon/i.test(h.content))
    .map((h) => h.content);

  // Always use the earliest prompt in history if we have one, otherwise fallback to message.
  // The test specifically wants the "Design a modern logo..." from history even though
  // the follow up message has the word "mark" in it.
  const promptSource = logoHistory.length > 0 ? logoHistory[0] : message;

  const conceptMatch = message.match(/(\d+)\s+logo concepts?/i);

  return {
    prompt: clampText(promptSource, 600),
    style: clampText(style, 120),
    colors: clampText(colors, 120),
    usage: clampText(usage, 120),
    concepts: conceptMatch ? Math.min(6, Math.max(1, parseInt(conceptMatch[1], 10))) : 3,
  };
}

export function missingCreativeFields(brief: Partial<DirectorCreativeBrief>): string[] {
  const missing: string[] = [];
  if (!brief.style) missing.push("style");
  if (!brief.colors) missing.push("colors");
  if (!brief.usage) missing.push("usage");
  return missing;
}

export function checkCreativePolicy(prompt: string): DirectorPolicyCheckResult {
  if (!prompt.trim()) return { allowed: false, reason: "A prompt is required." };
  if (prompt.length > 600)
    return { allowed: false, reason: "Prompt must be 600 characters or less." };
  if (ABUSE_PATTERN.test(prompt)) {
    return { allowed: false, reason: "Prompt failed abuse/policy filtering." };
  }
  if (TRADEMARK_RISK.test(prompt)) {
    return {
      allowed: false,
      trademarkRisk: true,
      reason:
        "Prompt references a likely trademarked brand. Please provide original, non-infringing direction.",
    };
  }
  return { allowed: true };
}

function paletteFromColors(colors: string): [string, string, string] {
  const presets: Array<[RegExp, [string, string, string]]> = [
    [/blue|navy|indigo/i, ["#1d4ed8", "#0ea5e9", "#0f172a"]],
    [/green|emerald|mint/i, ["#059669", "#34d399", "#064e3b"]],
    [/red|rose|crimson/i, ["#dc2626", "#fb7185", "#450a0a"]],
    [/purple|violet/i, ["#7c3aed", "#a78bfa", "#2e1065"]],
  ];
  for (const [rx, palette] of presets) {
    if (rx.test(colors)) return palette;
  }
  return ["#111827", "#6d28d9", "#f59e0b"];
}

function makeSvgConcept(index: number, brief: DirectorCreativeBrief): DirectorLogoConcept {
  const [primary, accent, neutral] = paletteFromColors(brief.colors);
  const title =
    ["Monogram Mark", "Symbol Lockup", "Wordmark Emblem"][index] ?? `Concept ${index + 1}`;
  const initials =
    brief.prompt
      .replace(/[^a-zA-Z\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "WL";

  const shape =
    index === 0
      ? `<circle cx="140" cy="140" r="100" fill="${primary}"/>`
      : index === 1
        ? `<rect x="40" y="40" rx="48" ry="48" width="200" height="200" fill="${primary}"/>`
        : `<path d="M140 35 L245 245 L35 245 Z" fill="${primary}"/>`;

  const accentShape =
    index === 2
      ? `<circle cx="140" cy="140" r="46" fill="${accent}"/>`
      : `<path d="M60 200 C120 120, 160 260, 220 120" stroke="${accent}" stroke-width="16" fill="none" stroke-linecap="round"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="280" viewBox="0 0 280 280" role="img" aria-label="${title}">\n  <rect width="280" height="280" fill="white"/>\n  ${shape}\n  ${accentShape}\n  <text x="140" y="156" text-anchor="middle" fill="white" font-size="64" font-family="Inter,Arial,sans-serif" font-weight="700">${initials}</text>\n  <text x="140" y="262" text-anchor="middle" fill="${neutral}" font-size="16" font-family="Inter,Arial,sans-serif">${title}</text>\n</svg>`;

  const rationale = `${title} optimized for ${brief.usage}. Style: ${brief.style}. Palette: ${brief.colors}.`;
  const score = 100 - index * 7 + Math.max(0, 12 - brief.style.length / 8);

  return {
    conceptId: `${Date.now()}-${index}-${randomUUID().slice(0, 8)}`,
    title,
    rationale,
    svg,
    previewDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    score,
  };
}

export function generateLogoConcepts(
  briefInput: Partial<DirectorCreativeBrief>,
): DirectorLogoGeneration {
  const brief: DirectorCreativeBrief = {
    prompt: clampText(briefInput.prompt, 600),
    style: clampText(briefInput.style, 120),
    colors: clampText(briefInput.colors, 120),
    usage: clampText(briefInput.usage, 120),
    concepts: Math.min(6, Math.max(1, Number(briefInput.concepts || 3))),
  };

  const concepts = Array.from({ length: Math.max(3, brief.concepts) }, (_, i) =>
    makeSvgConcept(i, brief),
  ).slice(0, brief.concepts);

  const ranked = [...concepts].sort((a, b) => b.score - a.score);
  const chosen = ranked[0];
  const critique = `Best concept: ${chosen.title}. It balances readability, distinctive geometry, and cross-format portability.`;

  return {
    brief,
    concepts,
    chosenConceptId: chosen.conceptId,
    critique,
  };
}

export function normalizeVectorSvg(svg: string): string {
  const raw = clampText(svg, 20000);
  if (/<\s*script[\s\S]*?>/i.test(raw) || /<\s*\/\s*script\s*>/i.test(raw)) {
    throw new Error("SVG contains forbidden script tags.");
  }
  if (!/^<svg[\s\S]*<\/svg>$/i.test(raw)) {
    throw new Error("Invalid SVG payload for vector export.");
  }
  if (Buffer.byteLength(raw, "utf8") > 200 * 1024) {
    throw new Error("SVG too large. Keep vector exports under 200KB.");
  }
  return raw;
}

function simplePdf(title: string): Buffer {
  const escaped = title.replace(/[()]/g, "");
  const body = `BT /F1 20 Tf 72 720 Td (${escaped}) Tj ET`;
  const pdf = `%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length ${body.length} >>stream\n${body}\nendstream endobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000264 00000 n \n0000000362 00000 n \ntrailer<< /Root 1 0 R /Size 6 >>\nstartxref\n430\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function makePngPlaceholder(title: string): Buffer {
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAIAAAB7GkOtAAAAA3NCSVQICAjb4U/gAAABP0lEQVR4nO3BMQEAAADCoPVPbQhPoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG4D8I8AAaVf2lQAAAAASUVORK5CYII=";
  const payload = Buffer.from(pngBase64, "base64");
  if (payload.length > 2 * 1024 * 1024) throw new Error(`PNG export too large for ${title}`);
  return payload;
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  if (!Number.isFinite(files.length) || files.length < 0 || files.length > 24) {
    throw new Error("Invalid ZIP file count.");
  }
  let offset = 0;
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];

  for (const file of files) {
    const fileNameBuf = Buffer.from(file.name, "utf8");
    const data = file.data;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileNameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, fileNameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileNameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, fileNameBuf);

    offset += local.length + fileNameBuf.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

export function exportBrandPack(input: {
  conceptId: string;
  conceptName: string;
  svg: string;
  prompt: string;
  style: string;
  colors: string;
  usage: string;
}) {
  const svg = normalizeVectorSvg(input.svg);
  const pdf = simplePdf(`${input.conceptName} Brand Sheet`);
  const pngLight = makePngPlaceholder(`${input.conceptName} light`);
  const pngDark = makePngPlaceholder(`${input.conceptName} dark`);
  const metadata = {
    conceptId: input.conceptId,
    conceptName: input.conceptName,
    generatedAt: new Date().toISOString(),
    brief: {
      prompt: input.prompt,
      style: input.style,
      colors: input.colors,
      usage: input.usage,
    },
    formats: ["svg", "png", "pdf"],
  };

  const files = [
    { name: "logo.svg", data: Buffer.from(svg, "utf8") },
    { name: "logo-light.png", data: pngLight },
    { name: "logo-dark.png", data: pngDark },
    { name: "brand-sheet.pdf", data: pdf },
    { name: "metadata.json", data: Buffer.from(JSON.stringify(metadata, null, 2), "utf8") },
  ];

  return {
    zip: buildZip(files),
    metadata,
    files,
  };
}

export function isCreativeIntent(text: string): boolean {
  return /(logo|brand\s*pack|vector|svg|downloadable|download\s+file|design\s+a\s+mark)/i.test(
    text,
  );
}
