/**
 * Imperative layout for dynamic CSS values that cannot use attr() (e.g. calc gutters).
 * Uses the DOM style API — allowed under style-src-attr 'unsafe-inline' for libraries
 * and this narrow positioning helper; keeps style={ out of JSX for the inventory ratchet.
 */
export type DomEdgeInset = {
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
};

const EDGE_KEYS: (keyof DomEdgeInset)[] = ["left", "right", "top", "bottom"];

export function applyEdgeInset(el: HTMLElement | null, inset: DomEdgeInset): void {
  if (!el) return;
  for (const key of EDGE_KEYS) {
    const value = inset[key];
    if (value) el.style[key] = value;
    else el.style.removeProperty(key);
  }
}

export function applyCssVar(el: HTMLElement | null, name: string, value: string): void {
  if (!el) return;
  el.style.setProperty(name, value);
}
