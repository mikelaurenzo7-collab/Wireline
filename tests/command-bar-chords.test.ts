import { describe, expect, it } from "vitest";

import { APP_KEYBOARD_SHORTCUTS } from "../src/constants/navigation";

/**
 * Pure chord resolver — mirrors CommandBar:
 * first `g` arms; second key looks up APP_KEYBOARD_SHORTCUTS (including `g` → Settings).
 */
export function resolveGoChord(
  pendingGo: boolean,
  key: string,
  shortcuts: Record<string, string> = APP_KEYBOARD_SHORTCUTS,
): { href: string | null; nextPending: boolean } {
  const normalized = key.toLocaleLowerCase();
  if (normalized === "g" && !pendingGo) {
    return { href: null, nextPending: true };
  }
  if (!pendingGo) {
    return { href: null, nextPending: false };
  }
  const href = shortcuts[normalized.toUpperCase()] ?? null;
  return { href, nextPending: false };
}

describe("CommandBar g-chord navigation", () => {
  it("arms on g and navigates on the second key", () => {
    const armed = resolveGoChord(false, "g");
    expect(armed.nextPending).toBe(true);
    expect(armed.href).toBeNull();

    expect(resolveGoChord(true, "p").href).toBe("/phone");
    expect(resolveGoChord(true, "g").href).toBe("/settings");
  });

  it("maps APP_KEYBOARD_SHORTCUTS letters to live routes", () => {
    expect(resolveGoChord(true, "a").href).toBe("/overview");
    expect(resolveGoChord(true, "s").href).toBe("/studio");
    expect(resolveGoChord(true, "t").href).toBe("/knowledge");
    expect(resolveGoChord(true, "w").href).toBe("/connections");
    expect(resolveGoChord(true, "i").href).toBe("/inbox");
    expect(APP_KEYBOARD_SHORTCUTS.G).toBe("/settings");
    expect(APP_KEYBOARD_SHORTCUTS.P).toBe("/phone");
  });

  it("clears pending without navigating on unknown keys", () => {
    expect(resolveGoChord(true, "z")).toEqual({ href: null, nextPending: false });
  });
});
