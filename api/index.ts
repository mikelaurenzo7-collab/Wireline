// Vercel Serverless Function Handler
// This file serves as the entry point for all API routes on Vercel
// It imports the pre-built server bundle to avoid TypeScript/module resolution issues

// Import the pre-built server bundle (created by the build script)
// The build outputs dist/server.cjs which contains the bundled Express app
import * as serverModule from "../dist/server.cjs";

const app = serverModule.app || serverModule.default;

// Export the Express app as the serverless function handler
// Vercel will invoke this handler for all /api/* requests
export default app;
