import { useEffect } from "react";

/**
 * Publishes the *visual* viewport height as a `--app-vvh` CSS custom property
 * on <html>, in pixels.
 *
 * Why: on iOS/Android, the software keyboard does NOT shrink `100dvh`/`100vh`
 * in every browser — so a chat composer pinned to the bottom of a `100dvh`
 * container slides behind the keyboard. `window.visualViewport` reports the
 * region actually visible above the keyboard, so binding height to
 * `calc(var(--app-vvh) - <chrome>)` keeps the composer in view as the keyboard
 * opens and closes.
 *
 * Falls back gracefully: when `visualViewport` is unavailable the var is simply
 * never set, and consumers should default to `100dvh` in their `calc()`.
 *
 * Mount once near the root of a surface that needs keyboard-aware sizing.
 */
export function useVisualViewportVar(): void {
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    const root = document.documentElement;
    let frame = 0;

    const apply = () => {
      frame = 0;
      root.style.setProperty("--app-vvh", `${Math.round(vv.height)}px`);
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(apply);
    };

    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      root.style.removeProperty("--app-vvh");
    };
  }, []);
}
