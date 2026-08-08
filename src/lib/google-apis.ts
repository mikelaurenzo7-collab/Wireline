/**
 * Lazy `googleapis` accessor.
 *
 * `import { google } from "googleapis"` at module scope is extraordinarily
 * expensive: loading the package alone costs ~800-1300 ms and ~1,077 modules,
 * measured. Eight modules imported it that way, and because `vercel.json`
 * routes every `/api/:path*` through a single serverless function, that cost
 * was paid on EVERY cold start — a Stripe webhook, a Twilio status callback, a
 * health probe — regardless of whether the request touched Google at all. It
 * was the majority of total cold-start time.
 *
 * Import this instead and resolve the client at the point of use. The dynamic
 * import is cached by the module system, so the cost is paid once per process
 * and only by requests that actually reach a Google integration.
 */
type GoogleApis = (typeof import("googleapis"))["google"];

let cached: GoogleApis | null = null;

export async function googleApis(): Promise<GoogleApis> {
  if (!cached) {
    ({ google: cached } = await import("googleapis"));
  }
  return cached;
}
