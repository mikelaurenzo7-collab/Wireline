import { existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Separate browser files from executable server artifacts before serving dist. */
export function isolateApiPublicOutput(projectRoot) {
  const root = realpathSync(projectRoot);
  const dist = resolve(root, "dist");
  const client = resolve(dist, "client");
  // This operation moves only fresh build output inside this exact project.
  // Refuse linked or previously partitioned directories instead of deleting.
  if (lstatSync(dist).isSymbolicLink() || realpathSync(dist) !== dist) {
    throw new Error("The Render build output must be the project's own dist directory.");
  }
  if (existsSync(client)) throw new Error("Render public output is already partitioned.");
  for (const required of ["server.cjs", "index.html"]) {
    if (!lstatSync(resolve(dist, required)).isFile()) {
      throw new Error(`Missing generated Render API artifact: ${required}`);
    }
  }
  const entries = readdirSync(dist, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error("Render build output cannot contain symlinks.");
  }
  mkdirSync(client);
  for (const entry of entries) {
    // CJS bundles and their source maps are backend artifacts. The release
    // manifest is read by start.mjs and must also remain outside static files.
    if (/\.cjs(?:\.map)?$/i.test(entry.name) || entry.name === "render-release.json") continue;
    const source = resolve(dist, entry.name);
    const destination = resolve(client, entry.name);
    if (dirname(source) !== dist || dirname(destination) !== client) {
      throw new Error("Render build output cannot escape the generated directories.");
    }
    renameSync(source, destination);
  }
  return client;
}
