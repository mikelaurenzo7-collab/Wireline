// Vercel Serverless Function Handler
// This file serves as the entry point for all API routes on Vercel
// It imports the pre-built server bundle to avoid TypeScript/module resolution issues

// Import the pre-built server bundle (created by the build script)
// The build outputs dist/server.cjs which contains the bundled Express app
// @ts-ignore
import * as serverModule from "../dist/server.cjs";

// The bundled app is exported on the 'app' property via the build footer
const bundle = serverModule as unknown as Record<string, unknown>;
const app = bundle.app || bundle.default || serverModule;

// Export the Express app as the serverless function handler
// Vercel will invoke this handler for all /api/* requests
export default app;
