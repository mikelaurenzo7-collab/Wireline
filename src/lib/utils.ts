import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Detect "this fetch was aborted or the network blipped during navigation"
 * style errors that should NOT be logged as real failures. Used to keep
 * the console + Sentry quiet during normal SPA navigation.
 *
 * Catches:
 *   - DOMException AbortError (fetch.signal was aborted)
 *   - TypeError("Failed to fetch") — fires when a fetch is interrupted
 *     by navigation or the network drops momentarily
 *   - NS_BINDING_ABORTED (Firefox flavor)
 */
export function isAbortError(e: any): boolean {
  if (!e) return false;
  if (e.name === "AbortError") return true;
  const msg = String(e.message || e);
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("NS_BINDING_ABORTED") ||
    msg.includes("The user aborted a request") ||
    msg.includes("aborted")
  );
}

/**
 * Drop-in for `console.error("Failed to fetch foo:", e)` that filters
 * out expected abort/network-blip noise. Reduces Sentry signal loss +
 * keeps the console honest during E2E runs.
 */
export function logFetchError(label: string, e: any): void {
  if (isAbortError(e)) return;
   
  console.error(label, e);
}
