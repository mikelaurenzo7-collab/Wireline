#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specImport = pathToFileURL(path.resolve(root, "src/lib/openapi-spec.ts")).href;
const operations = JSON.parse(
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `import { listSpecOperations } from ${JSON.stringify(specImport)}; console.log(JSON.stringify(listSpecOperations()));`,
    ],
    {
      encoding: "utf8",
      cwd: root,
      // The OpenAPI module imports route schemas that construct the shared pool at
      // module load. Parity checking never queries the database, so keep this gate
      // hermetic instead of requiring a developer or CI secret.
      env: {
        ...process.env,
        POSTGRES_URL:
          process.env.POSTGRES_URL || "postgresql://wireline:wireline@127.0.0.1:5432/wireline",
      },
    },
  ),
);

function walk(dir) {
  const files = [];
  for (const item of readdirSync(dir)) {
    const full = path.join(dir, item);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(item)) files.push(full);
  }
  return files;
}

// Strip comments so a commented-out registration ("// router.get(...)") never
// satisfies parity while the operation actually 404s. Block comments go
// entirely; line comments are stripped only when the line STARTS with `//`,
// which covers disabled registrations without corrupting string literals that
// contain `//` (URLs) mid-line.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const routeText = walk(path.join(root, "src/routes"))
  .concat([path.join(root, "server.ts"), path.join(root, "src/server/register-api-routes.ts")])
  .map((file) => stripComments(readFileSync(file, "utf8")))
  .join("\n");

const mountedPrefixes = ["/api/health", "/api/intake", "/api/webhooks", "/api/quotas", "/api", ""];

function expressPath(openapiPath) {
  return openapiPath.replace(/\{([^}]+)\}/g, ":$1");
}

function routeCandidates(specPath) {
  const express = expressPath(specPath);
  const out = new Set([express]);
  for (const prefix of mountedPrefixes) {
    if (!prefix || !express.startsWith(prefix)) continue;
    const suffix = express.slice(prefix.length) || "/";
    out.add(suffix.startsWith("/") ? suffix : `/${suffix}`);
  }
  return [...out];
}

const methodMap = { get: "get", post: "post", put: "put", patch: "patch", delete: "delete" };
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const problems = [];
for (const { method, path: specPath } of operations) {
  const methodName = methodMap[method];
  const candidates = routeCandidates(specPath);
  // The method must be bound to the path in one registration, not merely
  // co-resident anywhere in the concatenated route text — `router.post(`
  // existing SOMEWHERE made the old check pass for every documented method,
  // so a handler switched to another verb (or deleted while its path string
  // survived in prose) kept parity green while the operation 404'd.
  const hasBoundRegistration =
    methodName &&
    candidates.some((candidate) =>
      new RegExp(
        `\\b(?:router|app)\\.${methodName}\\(\\s*["']${escapeRegExp(candidate)}["']`,
      ).test(routeText),
    );
  if (!hasBoundRegistration) {
    problems.push(
      `${method.toUpperCase()} ${specPath} is documented in OpenAPI but no matching Express path/method registration was found.`,
    );
  }
}

if (problems.length) {
  console.error("OpenAPI implementation parity failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`OpenAPI implementation parity ok (${operations.length} operations checked)`);
