import { useLayoutEffect, useRef } from "react";

/** Keep scroll clearance in sync when fixed navigation wraps or text is resized. */
export function useChromeHeight<T extends HTMLElement = HTMLElement>(
  scopeSelector: string,
  property: `--${string}`,
  enabled = true,
) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const scope = element?.closest<HTMLElement>(scopeSelector);
    if (!enabled || !element || !scope) return;

    const update = () => {
      scope.style.setProperty(property, `${Math.ceil(element.getBoundingClientRect().height)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
      scope.style.removeProperty(property);
    };
  }, [scopeSelector, property, enabled]);

  return ref;
}
