/** Pure proposal/execution contract. No OS, Node, credential or provider access. */
export type ComputerNativePlatform = "windows" | "macos";
export type ComputerNativeAction =
  | { type: "click"; x: number; y: number; button: "left" | "right"; clickCount: 1 | 2 }
  | { type: "scroll"; x: number; y: number; deltaX: number; deltaY: number }
  | { type: "type_text"; text: string }
  | { type: "keypress"; keys: string[] };

const MODIFIERS = new Set(["CTRL", "ALT", "SHIFT", "COMMAND"]);
const KEY_ALIASES: Record<string, string> = {
  CONTROL: "CTRL",
  META: "COMMAND",
  CMD: "COMMAND",
  OPTION: "ALT",
  ESCAPE: "ESC",
  ARROWUP: "UP",
  ARROWDOWN: "DOWN",
  ARROWLEFT: "LEFT",
  ARROWRIGHT: "RIGHT",
  " ": "SPACE",
  RETURN: "ENTER",
};
const KEYS = new Set([
  ...MODIFIERS,
  "ENTER",
  "TAB",
  "ESC",
  "BACKSPACE",
  "DELETE",
  "SPACE",
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "HOME",
  "END",
  "PAGEUP",
  "PAGEDOWN",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
]);
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

/** Coordinates are screenshot pixels; the executor independently verifies the current frame. */
export function validateComputerNativeAction(
  value: unknown,
  screenshot?: { width: number; height: number },
  platform?: ComputerNativePlatform,
): ComputerNativeAction {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid native action.");
  const row = value as Record<string, unknown>;
  if (row.type === "click" || row.type === "scroll") {
    const keys =
      row.type === "click"
        ? ["type", "x", "y", "button", "clickCount"]
        : ["type", "x", "y", "deltaX", "deltaY"];
    if (!exactKeys(row, keys) || !integer(row.x, 0, 16383) || !integer(row.y, 0, 16383))
      throw new Error("Invalid pointer target.");
    if (screenshot && (row.x >= screenshot.width || row.y >= screenshot.height))
      throw new Error("The proposed position is outside the selected window.");
    if (row.type === "click") {
      if (
        (row.button !== "left" && row.button !== "right") ||
        (row.clickCount !== 1 && row.clickCount !== 2)
      )
        throw new Error("Invalid click action.");
      return { type: "click", x: row.x, y: row.y, button: row.button, clickCount: row.clickCount };
    }
    if (
      !integer(row.deltaX, -2000, 2000) ||
      !integer(row.deltaY, -2000, 2000) ||
      (!row.deltaX && !row.deltaY)
    )
      throw new Error("Invalid scroll action.");
    return { type: "scroll", x: row.x, y: row.y, deltaX: row.deltaX, deltaY: row.deltaY };
  }
  if (row.type === "type_text") {
    if (
      !exactKeys(row, ["type", "text"]) ||
      typeof row.text !== "string" ||
      !row.text.length ||
      row.text.length > 2000 ||
      Array.from(row.text).some((character) => {
        const code = character.charCodeAt(0);
        return (code < 32 && code !== 10) || (code >= 127 && code <= 159);
      }) ||
      /^\s*(?:javascript|vbscript|data|file|shell|powershell|cmd|ms-[a-z0-9-]+):/i.test(row.text)
    )
      throw new Error("Invalid text action.");
    if (platform === "macos") {
      // Match the fixed Quartz helper's scalar-safe 20-UTF-16-unit chunks.
      // Leading line feeds cannot be reliably posted and must fail before approval.
      let units = 0;
      for (const character of row.text) {
        if (units + character.length > 20) units = 0;
        if (units === 0 && character === "\n") throw new Error("Invalid macOS text chunk.");
        units += character.length;
      }
    }
    return { type: "type_text", text: row.text };
  }
  if (row.type === "keypress") {
    if (
      !exactKeys(row, ["type", "keys"]) ||
      !Array.isArray(row.keys) ||
      row.keys.some((key) => typeof key !== "string")
    )
      throw new Error("Invalid key combination.");
    const keys = row.keys.map((key: string) => KEY_ALIASES[key.toUpperCase()] ?? key.toUpperCase());
    if (
      keys.length < 1 ||
      keys.length > 4 ||
      keys.some((key) => !KEYS.has(key)) ||
      new Set(keys).size !== keys.length ||
      keys.filter((key) => !MODIFIERS.has(key)).length !== 1 ||
      keys.slice(0, -1).some((key) => !MODIFIERS.has(key)) ||
      (keys.includes("COMMAND") && platform !== "macos") ||
      (keys.includes("TAB") && (keys.includes("ALT") || keys.includes("COMMAND"))) ||
      (keys.includes("SPACE") && (keys.includes("COMMAND") || keys.includes("ALT"))) ||
      (keys.includes("DELETE") && keys.includes("CTRL") && keys.includes("ALT")) ||
      (keys.includes("ESC") && keys.some((key) => MODIFIERS.has(key))) ||
      (keys.includes("COMMAND") && keys.some((key) => ["H", "M", "Q"].includes(key))) ||
      (platform !== "windows" &&
        keys.includes("CTRL") &&
        keys.some((key) => ["UP", "DOWN", "LEFT", "RIGHT"].includes(key)))
    )
      throw new Error("Invalid or system-wide key combination.");
    return { type: "keypress", keys };
  }
  throw new Error("Unsupported native action.");
}
