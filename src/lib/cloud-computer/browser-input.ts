/**
 * Translate browser-toolset key names into Playwright key strings.
 *
 * The model sends xdotool-style names ("Return", "ctrl+a", "Backspace Backspace");
 * Playwright expects "Enter", "Control+A". Unknown names are rejected instead of
 * being typed literally, so a malformed chord never turns into stray text.
 */

const MODIFIERS: Record<string, string> = {
  ctrl: "Control",
  control: "Control",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
  meta: "Meta",
  cmd: "Meta",
  command: "Meta",
  super: "Meta",
  win: "Meta",
};

const NAMED_KEYS: Record<string, string> = {
  return: "Enter",
  enter: "Enter",
  kp_enter: "Enter",
  tab: "Tab",
  escape: "Escape",
  esc: "Escape",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  space: "Space",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  page_up: "PageUp",
  prior: "PageUp",
  pagedown: "PageDown",
  page_down: "PageDown",
  next: "PageDown",
  insert: "Insert",
};

for (let n = 1; n <= 12; n += 1) NAMED_KEYS[`f${n}`] = `F${n}`;

/** Normalize one key (no modifiers) or return null when it is not supported. */
export function normalizeKeyName(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const named = NAMED_KEYS[value.toLowerCase()];
  if (named) return named;
  if (value.length === 1 && /[\x20-\x7e]/.test(value)) {
    return /[a-z]/i.test(value) ? value.toUpperCase() : value;
  }
  return null;
}

/** "ctrl+shift+t" -> "Control+Shift+T". Returns null for unsupported chords. */
export function normalizeChord(raw: string): string | null {
  const parts = raw
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length || parts.length > 4) return null;
  const keyPart = parts[parts.length - 1];
  const modifiers: string[] = [];
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIERS[part.toLowerCase()];
    if (!modifier || modifiers.includes(modifier)) return null;
    modifiers.push(modifier);
  }
  const lone = MODIFIERS[keyPart.toLowerCase()];
  if (lone && !modifiers.length) return lone;
  const key = normalizeKeyName(keyPart);
  if (!key) return null;
  // Shifted letters stay uppercase; unmodified letters type lowercase.
  const finalKey =
    key.length === 1 && /[A-Z]/.test(key) && !modifiers.length ? key.toLowerCase() : key;
  return [...modifiers, finalKey].join("+");
}

/** Space-separated key sequence ("Backspace Backspace") -> Playwright chords. */
export function parseKeySequence(raw: string): string[] | null {
  if (typeof raw !== "string") return null;
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 20) return null;
  const chords: string[] = [];
  for (const token of tokens) {
    const chord = normalizeChord(token);
    if (!chord) return null;
    chords.push(chord);
  }
  return chords;
}

/** "shift", "ctrl+shift" -> ["Shift"], ["Control", "Shift"]. */
export function parseModifiers(raw: unknown): string[] | null {
  if (raw === undefined || raw === null || raw === "") return [];
  if (typeof raw !== "string") return null;
  const parts = raw
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  const modifiers: string[] = [];
  for (const part of parts) {
    const modifier = MODIFIERS[part];
    if (!modifier) return null;
    if (!modifiers.includes(modifier)) modifiers.push(modifier);
  }
  return modifiers;
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
