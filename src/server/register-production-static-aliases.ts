import type { Express, RequestHandler } from "express";
import type { ServerResponse } from "node:http";
import path from "node:path";

/** Match the public browser isolation policy already applied by the host edge. */
export function setPublicIsolationHeaders(res: ServerResponse): void {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");
}

/** Root-level icons and the web manifest, not application code or pages. */
const ROOT_BRAND_FILE =
  /^(?:favicon\.(?:ico|png|svg)|botbound-icon(?:-\d+)?\.(?:svg|png)|site\.webmanifest)$/;

/** Only successfully resolved, public static assets may override no-store. */
export function productionStaticHeaders(publicDirectory: string) {
  return (res: ServerResponse, filePath: string): void => {
    const relative = path.relative(publicDirectory, filePath).split(path.sep).join("/");
    if (relative.startsWith("assets/") || relative.startsWith("fonts/")) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else if (relative === "fonts.css" || ROOT_BRAND_FILE.test(relative)) {
      // Favicons, the app icon and the manifest load on every page. A short
      // public cache keeps a deploy's instance swap from surfacing as a broken
      // icon, while a rebrand still propagates within a day.
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
    // Public brand images are embedded in email and shared previews. Keep the
    // default isolation for application code, pages, API data and missing files.
    if (/^brand\/[a-z0-9-]+\.(?:png|webp)$/i.test(relative)) {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    }
  };
}

/** Exact public aliases. `/legal/data-deletion` stays a static document. */
const LEGACY_CONTENT_REDIRECTS = [
  ["/legal", "/terms"],
  ["/docs", "/developers"],
  // Retired destinations that previously relied on a client-side shell
  // redirect (HTTP 200 + SPA navigation). Permanent server redirects keep old
  // links and crawlers deterministic, and still preserve the query string.
  ["/blog", "/changelog"],
  ["/security", "/trust"],
  // /showcase intentionally lands on plan-neutral account creation, keeping
  // the historical funnel and its pinned contracts.
  ["/showcase", "/signup"],
  ["/solutions", "/solutions/support"],
  ["/use-cases", "/solutions/support"],
  ["/login", "/signin"],
  ["/reset", "/reset-password"],
] as const;

export function registerLegacyContentRedirects(app: Express): void {
  for (const [source, destination] of LEGACY_CONTENT_REDIRECTS) {
    app.get([source, `${source}/`], (req, res) => {
      const queryStart = req.originalUrl.indexOf("?");
      const query = queryStart >= 0 ? req.originalUrl.slice(queryStart) : "";
      res.redirect(301, `${destination}${query}`);
    });
  }
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
}

/** Run after real routes/static files, before the SPA shell fallback. */
export const rejectMissingPublicResource: RequestHandler = (req, res, next) => {
  // Match the existing host's SPA rewrite exclusions. A dot inside a route
  // segment remains valid; only a final file extension is treated as a file.
  if (!/^\/(?:api\/|assets\/|legal\/|recap\/|.+\.[A-Za-z0-9]+$)/.test(req.path)) return next();
  res.setHeader("Cache-Control", "no-store");
  res.status(404).type("text").send("Not found.");
};
