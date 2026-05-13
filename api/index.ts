// Vercel serverless entry point.
// Imports the fully-configured Express app (all routes registered at module
// load time) and re-exports it so Vercel can call it as a serverless handler.
// The frontend is served by Vercel's CDN from the `dist/` build output —
// this function handles only /api/* requests.
import { app } from '../server.js';

export default app;
