import "./lib/polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Open‑space preference – removed compact overrides

// Global error + rejection safety net for voice + async surfaces.
// Vapi WebSocket drops, ElevenLabs streaming failures, recipe promise
// rejections, and any uncaught third-party widget errors all land here.
// This prevents silent white screens or broken agent states for SMB operators
// who expect the console to "just work" even when the network hiccups.
if (typeof window !== "undefined") {
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
    if (message && (
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("error loading dynamically imported module")
    )) {
      console.error("[wireline:preload] Dynamic import failed, reloading page to get new version...");
      window.location.reload();
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
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg && (
      msg.includes("Failed to fetch dynamically imported module") ||
      msg.includes("error loading dynamically imported module")
    )) {
      console.error("[wireline:preload] Dynamic import rejection, reloading page to get new version...");
      window.location.reload();
      return;
    }
    report("unhandled-rejection", reason);
  });

  // Handle Vite's custom preload error event
  window.addEventListener("vite:preloadError", () => {
    console.error("[wireline:preload] Vite preload error, reloading page...");
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register Service Worker for Progressive Web App (PWA) support on production builds
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // Only register in production to prevent caching issues during dev HMR
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("[wireline:sw] Registration failed:", err);
      });
    }
  });
}
