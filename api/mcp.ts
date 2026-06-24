import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const bundle = require("../dist/chatgpt-mcp-api.cjs") as { default?: unknown } | unknown;

export default (
  bundle && typeof bundle === "object" && "default" in bundle
    ? (bundle as { default: unknown }).default
    : bundle
);
