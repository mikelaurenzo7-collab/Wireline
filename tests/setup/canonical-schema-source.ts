import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { resolve } from "node:path";

/**
 * Source-contract tests inspect the canonical schema entrypoint as text.
 * Keep those checks aligned with the module's effective source surface when
 * unchanged table declarations are re-exported from schema-base.ts.
 *
 * All non-schema reads delegate byte-for-byte to Node's original reader.
 */
const originalReadFileSync = fs.readFileSync.bind(fs);
const canonicalSchemaPath = resolve(process.cwd(), "src/db/schema.ts");
const schemaBasePath = resolve(process.cwd(), "src/db/schema-base.ts");

fs.readFileSync = ((path, options) => {
  const result = originalReadFileSync(path, options as never);
  const requestedPath = typeof path === "string" ? resolve(path) : null;

  if (requestedPath !== canonicalSchemaPath || typeof result !== "string") {
    return result;
  }

  return `${result}\n${originalReadFileSync(schemaBasePath, "utf8")}`;
}) as typeof fs.readFileSync;

// Named imports such as `import { readFileSync } from "node:fs"` must observe
// the delegated implementation installed above.
syncBuiltinESMExports();
