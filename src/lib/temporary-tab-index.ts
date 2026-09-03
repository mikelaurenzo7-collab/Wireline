export type TemporaryTabIndexTarget = Pick<
  HTMLElement,
  "getAttribute" | "hasAttribute" | "removeAttribute" | "setAttribute"
>;

/**
 * Make a programmatically focused element focusable without overwriting an
 * author-defined tabindex. The returned cleanup only removes the attribute
 * this helper added, and only while it still has the temporary value.
 */
export function addTemporaryTabIndex(target: TemporaryTabIndexTarget): () => void {
  if (target.hasAttribute("tabindex")) return () => undefined;

  target.setAttribute("tabindex", "-1");
  return () => {
    if (target.getAttribute("tabindex") === "-1") {
      target.removeAttribute("tabindex");
    }
  };
}
