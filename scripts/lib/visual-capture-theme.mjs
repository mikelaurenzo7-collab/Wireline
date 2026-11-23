/**
 * Appearance for a visual QA capture. BotBound opens in light by design and
 * stores an explicit choice under `wireline-theme` (src/contexts/ThemeContext.tsx);
 * the system color-scheme preference does not switch it. A dark capture must
 * therefore set that stored choice before the app boots, or every "dark" run
 * silently photographs the light theme.
 */
export const VISUAL_CAPTURE_THEMES = Object.freeze(["light", "dark"]);
export const THEME_STORAGE_KEY = "wireline-theme";

export function visualCaptureTheme(env = process.env) {
  const theme = String(env.WIRELINE_VISUAL_THEME || "light")
    .trim()
    .toLowerCase();
  if (!VISUAL_CAPTURE_THEMES.includes(theme)) {
    throw new Error(`WIRELINE_VISUAL_THEME must be one of: ${VISUAL_CAPTURE_THEMES.join(", ")}.`);
  }
  return theme;
}

/**
 * Init script for a Playwright context: store the dark choice; light stays the
 * first-visit default. One object argument, because addInitScript passes one.
 */
export function applyCaptureTheme({ theme, storageKey }) {
  if (theme !== "dark") return;
  try {
    // Runs in the page (addInitScript), where localStorage is a global.
    globalThis.localStorage.setItem(storageKey, "dark");
  } catch {
    /* private contexts may block storage */
  }
}
