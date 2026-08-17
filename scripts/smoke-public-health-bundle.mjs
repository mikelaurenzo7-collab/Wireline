import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bundle = require("../dist/public-health-api.cjs");
const handler =
  bundle && typeof bundle === "object" && "default" in bundle ? bundle.default : bundle;

if (typeof handler !== "function") {
  throw new Error("public health bundle does not export a callable handler");
}

console.log("public health bundle imports with a callable handler");

// The public-health smoke runs after the complete client build in the canonical
// Vercel pipeline. Keep the release-time performance check here so every preview
// and production artifact is measured exactly as deployed, not from source-size
// estimates or a separate best-effort workflow.
await import("./check-client-bundle-budgets.mjs");
