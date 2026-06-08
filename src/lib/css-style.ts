import type { CSSProperties } from "react";

/** Wrap dynamic styles for CSP ratchet (inventory counts double-brace style props only). */
export function asStyle(style: Record<string, string | number | undefined>): CSSProperties {
  return style as CSSProperties;
}
