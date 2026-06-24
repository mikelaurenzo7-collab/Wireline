/* Generated from design-tokens/wireline.tokens.json. Do not edit by hand. */
export const wirelineTokenValues = {
  "color.action.primary.container": "rgba(93, 63, 211, 0.10)",
  "color.action.primary.default": "#5D3FD3",
  "color.action.primary.pressed": "#451EBB",
  "color.border.default": "#C9C4D7",
  "color.border.strong": "#B9C0D0",
  "color.canvas.default": "#F8F9FF",
  "color.status.error": "#C12A2A",
  "color.status.info": "#315D9F",
  "color.status.success": "#19703B",
  "color.status.warning": "#995D08",
  "color.surface.container": "#E5EEFF",
  "color.surface.default": "#FFFFFF",
  "color.surface.strong": "#DDE3F0",
  "color.surface.subtle": "#EFF4FF",
  "color.text.onAction": "#FFFFFF",
  "color.text.primary": "#0B1C30",
  "color.text.secondary": "#5F687B",
  "font.family.body": "Inter",
  "font.family.display": "Hanken Grotesk",
  "font.family.mono": "JetBrains Mono",
  "motion.duration.fast": "120ms",
  "motion.duration.slow": "300ms",
  "motion.duration.standard": "200ms",
  "motion.press": 0.98,
  "radius.lg": "8px",
  "radius.md": "6px",
  "radius.pill": "999px",
  "radius.sm": "4px",
  "radius.xl": "16px",
  "space.050": "4px",
  "space.100": "8px",
  "space.150": "12px",
  "space.200": "16px",
  "space.300": "24px",
  "space.400": "32px",
  "space.600": "48px"
} as const;

export type WirelineTokenPath = keyof typeof wirelineTokenValues;

export function wirelineToken(path: WirelineTokenPath) {
  return wirelineTokenValues[path];
}
