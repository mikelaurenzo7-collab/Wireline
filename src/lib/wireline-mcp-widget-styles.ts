/**
 * Canonical Wireline dark styling for ChatGPT MCP HTML widgets.
 * Values mirror design-tokens/wireline.tokens.json. Keep them synchronized via
 * build-design-tokens.
 */
export const WIRELINE_MCP_WIDGET_TOKENS = {
  canvas: "#0A0A0E",
  surface: "#141319",
  surfaceSubtle: "#18161E",
  action: "#A78BFA",
  actionPressed: "#8B5CF6",
  text: "#F5F4F8",
  muted: "#B6B1C6",
  tertiary: "#8B87A0",
  border: "#262430",
  radiusLg: "12px",
  radiusMd: "10px",
  shadowCard: "0 8px 24px -16px rgba(0, 0, 0, 0.6)",
  fontDisplay: '"Inter Tight", Inter, ui-sans-serif, system-ui, sans-serif',
} as const;

export function buildWirelineMcpWidgetCss(): string {
  const t = WIRELINE_MCP_WIDGET_TOKENS;
  return `
:root {
  color-scheme: dark;
  --wl-canvas: ${t.canvas};
  --wl-surface: ${t.surface};
  --wl-surface-subtle: ${t.surfaceSubtle};
  --wl-action: ${t.action};
  --wl-action-pressed: ${t.actionPressed};
  --wl-text: ${t.text};
  --wl-muted: ${t.muted};
  --wl-tertiary: ${t.tertiary};
  --wl-border: ${t.border};
  --wl-radius-lg: ${t.radiusLg};
  --wl-radius-md: ${t.radiusMd};
  --wl-shadow-card: ${t.shadowCard};
  --wl-font-display: ${t.fontDisplay};
  --wl-font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-synthesis: none;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: transparent;
  color: var(--wl-text);
  font-family: var(--wl-font-ui);
  text-rendering: auto;
  -webkit-font-smoothing: auto;
  -moz-osx-font-smoothing: auto;
}
#app { max-width: 680px; margin: 0 auto; padding: 14px; }
.card {
  border: 1px solid var(--wl-border);
  border-radius: var(--wl-radius-lg);
  padding: 16px;
  background: var(--wl-surface);
  box-shadow: var(--wl-shadow-card);
}
.eyebrow {
  font-family: var(--wl-font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--wl-muted);
}
h2 { font-family: var(--wl-font-display); margin: 5px 0 4px; font-size: 20px; line-height: 1.2; letter-spacing: -0.02em; }
p { margin: 0; line-height: 1.45; color: var(--wl-muted); }
.meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 14px 0; }
.meta div {
  border-radius: var(--wl-radius-md);
  padding: 9px 10px;
  background: var(--wl-surface-subtle);
  border: 1px solid var(--wl-border);
}
.meta strong {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--wl-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.meta span { display: block; margin-top: 2px; font-size: 13px; color: var(--wl-text); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
button, a.button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--wl-border);
  border-radius: var(--wl-radius-md);
  padding: 10px 12px;
  background: var(--wl-surface);
  color: var(--wl-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  min-height: 44px;
}
button.primary { background: var(--wl-action); color: #0E0B16; border-color: var(--wl-action); }
button.primary:active { background: var(--wl-action-pressed); }
button:disabled { opacity: 0.55; cursor: not-allowed; }
button:focus-visible, a.button:focus-visible {
  outline: 2px solid var(--wl-action);
  outline-offset: 2px;
}
.status { margin-top: 11px; min-height: 20px; font-size: 13px; color: var(--wl-muted); }
.note { margin-top: 12px; font-size: 12px; color: var(--wl-tertiary); }
.composer {
  display: grid;
  gap: 10px;
  margin-top: 14px;
  border: 1px solid var(--wl-border);
  border-radius: var(--wl-radius-lg);
  background: var(--wl-surface);
  box-shadow: var(--wl-shadow-card);
  padding: 12px;
}
.composer textarea {
  width: 100%;
  min-height: 72px;
  resize: vertical;
  border: 0;
  background: transparent;
  color: var(--wl-text);
  font: inherit;
  line-height: 1.45;
  outline: none;
}
.composer textarea::placeholder { color: var(--wl-tertiary); }
.composer .actions { margin-top: 0; }
.live {
  display: none;
  margin-top: 12px;
  border-radius: var(--wl-radius-md);
  padding: 10px;
  background: var(--wl-surface-subtle);
  border: 1px solid var(--wl-border);
  font-size: 13px;
  color: var(--wl-text);
}
.live.show { display: block; }
@media (max-width: 460px) { .meta { grid-template-columns: 1fr; } }
`.trim();
}
