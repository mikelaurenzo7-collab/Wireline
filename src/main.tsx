import "./lib/polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// CSS layer order: base tokens first, then shell layout, compatibility aliases,
// design utilities, and preview-specific classes before auth hardening.
import "./styles/app-shell.css";
import "./styles/legacy-aliases.css";
import "./styles/wireline-design-system.css";
import "./styles/design-preview.css";
// Authenticated-surface contrast hardening — must load AFTER the core CSS stack so its
// theme-aware --color-brand-ink override and ghost-button rules win the cascade.
import "./styles/auth-contrast.css";
// Preview-only brand direction: dark command-center Wireline, no Aurora Cream / purple bleed.
import "./styles/wireline-command-preview.css";
// Open‑space preference – removed compact overrides

// Global error + rejection safety net for voice + async surfaces.
// Vapi WebSocket drops, ElevenLabs streaming failures, recipe promise
// rejections, and any uncaught third-party widget errors all land here.
// This prevents silent white screens or broken agent states for SMB operators
// who expect the console to "just work" even when the network hiccups.
if (typeof window !== "undefined") {
  // Clear preload reload loop state flags on successful initialization
  try {
    sessionStorage.removeItem("wireline:preload-reload-count");
    sessionStorage.removeItem("wireline:last-preload-reload");
  } catch (_e) {
    // sessionStorage might be disabled or blocked
  }

  const safeReload = (reason: string) => {
    try {
      const now = Date.now();
      const lastReload = sessionStorage.getItem("wireline:last-preload-reload");
      const reloadCount = Number(sessionStorage.getItem("wireline:preload-reload-count") || "0");

      if (lastReload && now - Number(lastReload) < 10000 && reloadCount >= 2) {
        console.error(
          `[wireline:preload] Preload failed repeatedly (${reason}). Preventing infinite reload loop.`,
        );
        return;
      }

      sessionStorage.setItem("wireline:last-preload-reload", String(now));
      sessionStorage.setItem("wireline:preload-reload-count", String(reloadCount + 1));
      window.location.reload();
    } catch (e) {
      console.error("[wireline:preload] Failed to perform safe reload:", e);
      window.location.reload();
    }
  };

  const report = (kind: string, err: unknown, extra?: Record<string, unknown>) => {
    // Always surface in console for local debugging
    console.error(`[wireline:${kind}]`, err, extra);
    // Plausible already loaded via index.html — tag the event so we see
    // production error volume without adding another analytics vendor.
    if (typeof window.plausible === "function") {
      window.plausible("Error", {
        props: { kind, message: err instanceof Error ? err.message : String(err) },
      });
    }
  };

  window.addEventListener("error", (event) => {
    const message = event.message || (event.error instanceof Error ? event.error.message : "");
    if (
      message &&
      (message.includes("Failed to fetch dynamically imported module") ||
        message.includes("error loading dynamically imported module"))
    ) {
      console.error("[wireline:preload] Dynamic import failed, initiating safe reload...");
      safeReload("error event");
      return;
    }
    report("window-error", event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason || "");
    if (
      message &&
      (message.includes("Failed to fetch dynamically imported module") ||
        message.includes("error loading dynamically imported module"))
    ) {
      console.error("[wireline:preload] Dynamic import rejection, initiating safe reload...");
      safeReload("unhandled rejection");
      return;
    }
    report("unhandled-rejection", reason);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
