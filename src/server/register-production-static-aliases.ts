import type { Express, RequestHandler } from "express";
import type { ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Match the public browser isolation policy already applied by the host edge. */
export function setPublicIsolationHeaders(res: ServerResponse): void {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");
}

/** Only successfully resolved, public static assets may override no-store. */
export function productionStaticHeaders(publicDirectory: string) {
  return (res: ServerResponse, filePath: string): void => {
    const relative = path.relative(publicDirectory, filePath).split(path.sep).join("/");
    if (relative.startsWith("assets/") || relative.startsWith("fonts/")) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (relative === "fonts.css") {
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  };
}

function sendWebManifest(publicDirectory: string): RequestHandler {
  return (_req, res) => {
    const filePath = path.join(publicDirectory, "site.webmanifest");
    if (!existsSync(filePath)) {
      res.setHeader("Cache-Control", "no-store");
      res.status(404).type("text").send("Not found.");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.type("application/manifest+json");
    res.send(readFileSync(filePath));
  };
}

/** Preserve public URLs whose redirects/rewrites previously ran at the host edge. */
export function registerProductionStaticAliases(app: Express, publicDirectory: string): void {
  app.all("/status", (req, res) => {
    const queryStart = req.originalUrl.indexOf("?");
    const query = queryStart >= 0 ? req.originalUrl.slice(queryStart) : "";
    res.redirect(308, `/trust${query}`);
  });

  // Meta's signed deletion callback returns this extensionless confirmation
  // URL. Serve the existing legal document, retaining its query in the browser.
  app.get("/legal/data-deletion", (_req, res) => {
    res.sendFile(path.join(publicDirectory, "legal", "data-deletion.html"));
  });

  // Chromium and common PWA probes look for /manifest.json or
  // /manifest.webmanifest even when the HTML shell points at /site.webmanifest.
  // One file, three paths, professional install chrome.
  const sendManifest = sendWebManifest(publicDirectory);
  app.get("/manifest.json", sendManifest);
  app.get("/manifest.webmanifest", sendManifest);
  app.get("/site.webmanifest", sendManifest);
}

/** Run after real routes/static files, before the SPA shell fallback. */
export const rejectMissingPublicResource: RequestHandler = (req, res, next) => {
  // Match the existing host's SPA rewrite exclusions. A dot inside a route
  // segment remains valid; only a final file extension is treated as a file.
  if (!/^\/(?:api\/|assets\/|legal\/|recap\/|.+\.[A-Za-z0-9]+$)/.test(req.path)) return next();
  res.setHeader("Cache-Control", "no-store");
  res.status(404).type("text").send("Not found.");
};
