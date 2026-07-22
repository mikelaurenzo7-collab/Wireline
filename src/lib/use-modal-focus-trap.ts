import { useEffect, useRef, type RefObject } from "react";

type ModalFocusTrapOptions = {
  /** When false the trap is inert (e.g. the modal is closed). Defaults to true. */
  active?: boolean;
  /** Called when the Escape key is pressed anywhere while the trap is active. */
  onEscape?: () => void;
};

type ActiveFocusTrap = {
  id: symbol;
  container: HTMLElement;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=\"true\"]",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(", ");

const activeFocusTraps: ActiveFocusTrap[] = [];

function isTopmostTrap(id: symbol) {
  return activeFocusTraps[activeFocusTraps.length - 1]?.id === id;
}

function getFocusable(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      const style = window.getComputedStyle(element);
      return (
        !element.matches(":disabled") &&
        !element.closest('[aria-hidden="true"], [inert]') &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        element.offsetParent !== null
      );
    },
  );
}

function eventBelongsToNestedModal(event: KeyboardEvent, container: HTMLElement) {
  const target = event.target;
  if (!(target instanceof Element) || container.contains(target)) return false;
  const owner = target.closest<HTMLElement>('[role="dialog"][aria-modal="true"]');
  return Boolean(owner && owner !== container);
}

/**
 * Give hand-rolled dialogs the same keyboard lifecycle Radix provides:
 * establish initial focus, contain Tab / Shift+Tab, close on Escape, and return
 * focus to the trigger after the dialog unmounts. A module-level stack ensures
 * only the top custom dialog handles keyboard input when overlays are nested.
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

    const trapId = Symbol("wireline-modal-focus-trap");
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let addedContainerTabIndex = false;
    activeFocusTraps.push({ id: trapId, container });

    const focusFrame = requestAnimationFrame(() => {
      if (!isTopmostTrap(trapId) || container.contains(document.activeElement)) return;
      const first = getFocusable(container)[0];
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
      if (
        !isTopmostTrap(trapId) ||
        event.defaultPrevented ||
        eventBelongsToNestedModal(event, container)
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable(container);
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

    // Capture before page-level shortcuts can move focus behind the active dialog.
    document.addEventListener("keydown", handleKey, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKey, true);

      const wasTopmost = isTopmostTrap(trapId);
      const trapIndex = activeFocusTraps.findIndex((trap) => trap.id === trapId);
      if (trapIndex >= 0) activeFocusTraps.splice(trapIndex, 1);
      if (addedContainerTabIndex) container.removeAttribute("tabindex");
      if (!wasTopmost) return;

      const nextTrap = activeFocusTraps[activeFocusTraps.length - 1];
      const expectedNextId = nextTrap?.id;
      requestAnimationFrame(() => {
        const currentTop = activeFocusTraps[activeFocusTraps.length - 1];
        if (currentTop?.id !== expectedNextId) return;

        if (
          previouslyFocused &&
          document.contains(previouslyFocused) &&
          (!nextTrap || nextTrap.container.contains(previouslyFocused))
        ) {
          previouslyFocused.focus();
          return;
        }

        if (nextTrap && document.contains(nextTrap.container)) {
          const nextFocusable = getFocusable(nextTrap.container)[0];
          (nextFocusable ?? nextTrap.container).focus();
        }
      });
    };
  }, [active, containerRef]);
}
