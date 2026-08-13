import { log } from "./server-context";
import { reportError } from "./error-reporter";

/**
 * Run work that must outlive the HTTP response.
 *
 * On Vercel, the function instance freezes as soon as the response is sent,
 * so a detached promise (fire-and-forget) can be suspended mid-flight and
 * silently lost — an auto-dial that never dials, a webhook row that never
 * lands. Vercel's runtime exposes waitUntil through a request context on
 * globalThis; when present, it keeps the instance alive until the promise
 * settles. Outside Vercel (dev server, tests) the promise simply runs
 * detached, which is safe on an always-on process.
 */

type VercelRequestContext = {
  get?: () => { waitUntil?: (promise: Promise<unknown>) => void } | undefined;
};

function vercelWaitUntil(promise: Promise<unknown>): boolean {
  const context = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
    VercelRequestContext | undefined;
  const waitUntil = context?.get?.()?.waitUntil;
  if (typeof waitUntil !== "function") return false;
  waitUntil(promise);
  return true;
}

export function runInBackground(label: string, work: () => Promise<unknown>): void {
  const promise = work().catch((error: unknown) => {
    // Post-response work has no error middleware behind it — this catch IS
    // the handler of last resort for lost leads, dropped webhook rows, and
    // failed dial follow-ups. Error severity plus external reporting, not a
    // warn that Vercel's error view never surfaces.
    log.error(`background work failed: ${label}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    reportError(error, { tags: { surface: "background", label } });
  });
  vercelWaitUntil(promise);
}
