import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Shared context for the Clear System check modules. Each module receives one
 * instance and pushes human-readable failures onto it; the orchestrator
 * reports them together so a single run surfaces every violation.
 */
export function createCheckContext(root = process.cwd()) {
  const failures = [];
  const cache = new Map();

  function pathFor(relativePath) {
    return resolve(root, relativePath);
  }

  function read(relativePath) {
    if (cache.has(relativePath)) return cache.get(relativePath);
    const path = pathFor(relativePath);
    if (!existsSync(path)) {
      failures.push(`${relativePath}: missing`);
      cache.set(relativePath, "");
      return "";
    }
    let source = readFileSync(path, "utf8");

    // Contract checks operate on a module's public source surface. When a
    // canonical TypeScript entrypoint delegates unchanged definitions to a
    // sibling `*-base.ts` module, include that source so integrity checks do
    // not become blind to the re-exported table graph.
    if (source.includes('export * from "./schema-base";')) {
      const baseRelativePath = relativePath.replace(/\.ts$/, "-base.ts");
      const basePath = pathFor(baseRelativePath);
      if (baseRelativePath !== relativePath && existsSync(basePath)) {
        source = `${source}\n${readFileSync(basePath, "utf8")}`;
      }
    }

    cache.set(relativePath, source);
    return source;
  }

  function mustInclude(file, source, pattern, message) {
    if (!pattern.test(source)) failures.push(`${file}: ${message}`);
  }

  function mustExclude(file, source, pattern, message) {
    if (pattern.test(source)) failures.push(`${file}: ${message}`);
  }

  function mustBeDeleted(relativePath, message) {
    if (existsSync(pathFor(relativePath))) failures.push(`${relativePath}: ${message}`);
  }

  return { failures, read, mustInclude, mustExclude, mustBeDeleted };
}
