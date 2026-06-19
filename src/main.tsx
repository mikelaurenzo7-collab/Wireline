import "./lib/polyfills";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/stitch-console.css";

// Figma overhaul migration: legacy shell/style layers are intentionally not
// imported here. They carried old Tailwind @apply contracts and color tokens
// that blocked Vercel from compiling the new Make-based surface.

// Global error + rejection safety net for voice + async surfaces.
if (typeof window !== "undefined") {
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
    console.error(`[wireline:${kind}]`, err, extra);
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
    report("error", event.error ?? message, { filename: event.filename, lineno: event.lineno });
  });

  window.addEventListener("unhandledrejection", (event) => {
    report("unhandledrejection", event.reason);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
