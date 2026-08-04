import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bundle = require("../../dist/public-health-api.cjs") as { default?: unknown } | unknown;

export default (
  bundle && typeof bundle === "object" && "default" in bundle
    ? (bundle as { default: unknown }).default
    : bundle
);
