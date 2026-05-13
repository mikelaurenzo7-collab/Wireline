// Vercel serverless entry point.
// Imports the fully-configured Express app (all routes registered at module
import serverExports from '../dist/server.cjs';

export const app = serverExports.app;
export default serverExports.app;

