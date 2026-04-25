/**
 * Thin entry point. All of the actual server lives in `./server/`.
 *
 * Keeping this file at the repo root preserves the existing build pipeline
 * (`esbuild server.ts ... --outdir=dist`) and `npm run dev`/`npm start`
 * scripts without changes.
 */
import { startServer } from "./server/index";

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
