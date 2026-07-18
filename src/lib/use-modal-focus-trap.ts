import { useEffect, useRef, type RefObject } from "react";

type ModalFocusTrapOptions = {
  /** When false the trap is inert (e.g. the modal is closed). Defaults to true. */
  active?: boolean;
  /** Called when the Escape key is pressed anywhere while the trap is active. */
  onEscape?: () => void;
};

/**
 * Trap keyboard focus within a modal container while `active`: move initial
 * focus inside, cycle Tab / Shift+Tab within the container so keyboard users
 * can't reach content behind it, and close on Escape regardless of where focus
 * currently sits. Mirrors the C5 focus-trap pattern in PageShell so hand-rolled
 * dialogs (CreateAgentDialog, PostCreateActivationWizard) behave consistently.
 */
export function useModalFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active = true, onEscape }: ModalFocusTrapOptions = {},
): void {
  // Keep the latest onEscape without re-running the trap effect every render.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const getFocusable = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);

    // Move focus inside the modal if it isn't already there.
    if (!container.contains(document.activeElement)) {
      getFocusable()[0]?.focus();
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement;
      if (event.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [active, containerRef]);
}
