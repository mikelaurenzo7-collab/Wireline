import { useEffect } from "react";

/**
 * Lock body scroll while `active` is true. Used by modal-style
 * overlays (ConfirmModal, CommandBar, DeployAgentModal,
 * TrialGateModal) so the page underneath can't creep around while
 * the dialog is open.
 *
 * Compensates for the scrollbar disappearing on `overflow: hidden`
 * by offsetting `padding-right` by the scrollbar's pre-lock width.
 * Without this, lockable content shifts ~15px to the right on
 * Windows / desktop Linux every time a modal opens — the exact
 * "pop-out" symptom Mike flagged.
 *
 * iOS Safari quirk: `overflow: hidden` alone doesn't fully stop
 * rubber-band scroll, but combined with the padding compensation
 * the visual jump is contained. A full iOS lock would need
 * `position: fixed` on the body — left out here because that
 * scrolls THE BODY itself back to top on close. The scrollbar
 * approach is the cleanest cross-platform baseline.
 *
 * Restore-on-cleanup is mandatory: if two modals open in sequence
 * and we ran a naive "set then set back," the second close would
 * leave the first's `overflow` value intact. We snapshot the
 * previous values per-call so the unmount path always restores
 * exactly what the caller saw, even when stacked.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [active]);
}
