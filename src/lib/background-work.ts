import { log } from "./server-context";

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
    | VercelRequestContext
    | undefined;
  const waitUntil = context?.get?.()?.waitUntil;
  if (typeof waitUntil !== "function") return false;
  waitUntil(promise);
  return true;
}

export function runInBackground(label: string, work: () => Promise<unknown>): void {
  const promise = work().catch((error: unknown) => {
    log.warn(`background work failed: ${label}`, {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  vercelWaitUntil(promise);
}
