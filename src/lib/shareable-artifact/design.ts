/**
 * Wireline Letterpress design tokens — server-inlined for SSR pages that
 * cannot depend on the SPA bundle. Values are the source-of-truth hex
 * anchors from `design-tokens/wireline.tokens.json`; when the token file
 * moves, update both places.
 *
 * The tokens ship as CSS custom properties so a single stylesheet renders
 * both themes and honors `prefers-color-scheme` without any client JS.
 */

export const WIRELINE_LETTERPRESS_PALETTE = {
  obsidian: {
    canvas: "#0A0A0E",
    canvasDeeper: "#050508",
    surface: "#141319",
    surfaceSubtle: "#100F15",
    surfaceRaised: "#201E29",
    border: "#262430",
    borderStrong: "#3A3745",
    borderSoft: "#1C1A22",
    textPrimary: "#F5F4F8",
    textSecondary: "#B6B1C6",
    textTertiary: "#8B87A0",
    textOnAction: "#0E0B16",
    actionPrimary: "#A78BFA",
    actionPressed: "#8B5CF6",
    actionHover: "#C4B5FD",
    actionContainer: "#1E1730",
    wire: "#C7CCD6",
    wireHover: "#DEE1E8",
    wireContainer: "#1C1D22",
    success: "#4ADE9A",
    warning: "#E8B85C",
    error: "#EF7B92",
    info: "#93A0C7",
    scrim: "rgba(4, 4, 7, 0.7)",
    glowPrimary: "rgba(167, 139, 250, 0.22)",
    glowWire: "rgba(199, 204, 214, 0.20)",
  },
  coolLight: {
    canvas: "#F5F4F0",
    canvasDeeper: "#EDEBE4",
    surface: "#FFFFFE",
    surfaceSubtle: "#F0EEE8",
    surfaceRaised: "#FFFFFF",
    border: "#D4D0C4",
    borderStrong: "#A9A69C",
    borderSoft: "#E4E1D8",
    textPrimary: "#141319",
    textSecondary: "#3A3745",
    textTertiary: "#6E6B78",
    textOnAction: "#F5F4F8",
    actionPrimary: "#6D28D9",
    actionPressed: "#5B21B6",
    actionHover: "#7C3AED",
    actionContainer: "#EDE4FE",
    wire: "#4A4B54",
    wireHover: "#2F3038",
    wireContainer: "#E7E5DD",
    success: "#0F8C5C",
    warning: "#A8710C",
    error: "#B23E56",
    info: "#374B7C",
    scrim: "rgba(220, 216, 208, 0.6)",
    glowPrimary: "rgba(109, 40, 217, 0.14)",
    glowWire: "rgba(74, 75, 84, 0.10)",
  },
} as const;

export type LetterpressTheme = keyof typeof WIRELINE_LETTERPRESS_PALETTE;

/**
 * The single decisive accent — validated against the ground the accent
 * will actually render on. The user picks one theme; the accent must be
 * readable on that theme's canvas. Both defaults are theme-specific and
 * self-consistent; a cross-theme accent that fails contrast on the
 * chosen ground is rejected so we never ship an unreadable page.
 */
export const MIN_ACCENT_CONTRAST_ON_OBSIDIAN = 3.0;
export const MIN_ACCENT_CONTRAST_ON_LIGHT = 3.0;

function relativeLuminance(hex: string): number {
  const norm = hex.replace(/^#/, "");
  if (norm.length !== 6) return 0;
  const values = [0, 2, 4].map((offset) => {
    const channel = parseInt(norm.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrast(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const brighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (brighter + 0.05) / (darker + 0.05);
}

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function isValidAccentHex(
  candidate: unknown,
  theme: LetterpressTheme = "obsidian",
): candidate is string {
  if (typeof candidate !== "string" || !HEX_PATTERN.test(candidate)) return false;
  const canvas = WIRELINE_LETTERPRESS_PALETTE[theme].canvas;
  const floor =
    theme === "obsidian" ? MIN_ACCENT_CONTRAST_ON_OBSIDIAN : MIN_ACCENT_CONTRAST_ON_LIGHT;
  return contrast(candidate, canvas) >= floor;
}

/** Canonical Wireline signature — used in every recap footer. */
export const WIRELINE_SIGNATURE = "Wire → Work → Win";

/** Minimal wire-glyph SVG. Inlined into the shell; scales with `currentColor`. */
export const WIRE_GLYPH_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M3 12h4.5l2-6 5 12 2-6H21" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
