import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bundle = require("../dist/public-health-api.cjs");
const handler =
  bundle && typeof bundle === "object" && "default" in bundle ? bundle.default : bundle;

if (typeof handler !== "function") {
  throw new Error("public health bundle does not export a callable handler");
}

console.log("public health bundle imports with a callable handler");
