/**
 * Compatibility export for historical internal imports.
 *
 * The canonical Wireline server entrypoint is now `server.ts`, which is also
 * the target used by local development, the production bundle, and Vercel.
 */
export { app } from "./server";
