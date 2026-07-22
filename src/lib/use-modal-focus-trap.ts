import { useEffect, useRef, type RefObject } from "react";

type ModalFocusTrapOptions = {
  /** When false the trap is inert (e.g. the modal is closed). Defaults to true. */
  active?: boolean;
  /** Called when the Escape key is pressed anywhere while the trap is active. */
  onEscape?: () => void;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(", ");

/**
 * Give hand-rolled dialogs the same keyboard lifecycle Radix provides:
 * establish initial focus, contain Tab / Shift+Tab, close on Escape, and return
 * focus to the trigger after the dialog unmounts.
 */
export function useModalFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active = true, onEscape }: ModalFocusTrapOptions = {},
): void {
  // Keep the latest callback without tearing down the keyboard listener.
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let addedContainerTabIndex = false;

    const getFocusable = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
        const style = window.getComputedStyle(element);
        return (
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true" &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          element.offsetParent !== null
        );
      });

    const focusFrame = requestAnimationFrame(() => {
      if (container.contains(document.activeElement)) return;
      const first = getFocusable()[0];
      if (first) {
        first.focus();
        return;
      }
      if (!container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
        addedContainerTabIndex = true;
      }
      container.focus();
    });

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey) {
        if (activeElement === first || !container.contains(activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeElement === last || !container.contains(activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    // Capture the event before page-level shortcuts can move focus behind the dialog.
    document.addEventListener("keydown", handleKey, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKey, true);
      if (addedContainerTabIndex) container.removeAttribute("tabindex");
      if (previouslyFocused && document.contains(previouslyFocused)) {
        requestAnimationFrame(() => previouslyFocused.focus());
      }
    };
  }, [active, containerRef]);
}
