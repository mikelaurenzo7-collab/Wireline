#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
const specImport = pathToFileURL(path.resolve(root, "src/lib/openapi-spec.ts")).href;
const tmp = path.join(os.tmpdir(), `wireline-openapi-${process.pid}.mjs`);
writeFileSync(
  tmp,
  `import { listSpecOperations } from ${JSON.stringify(specImport)};\nconsole.log(JSON.stringify(listSpecOperations()));\n`,
);
let operations;
try {
  operations = JSON.parse(
    execFileSync(process.execPath, [tsxCli, tmp], {
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
    }),
  );
} finally {
  rmSync(tmp, { force: true });
}

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

const routeText = walk(path.join(root, "src/routes"))
  .concat([
    path.join(root, "server.ts"),
    path.join(root, "src/server/register-api-routes.ts"),
  ])
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const mountedPrefixes = [
  "/api/health",
  "/api/intake",
  "/api/webhooks",
  "/api/quotas",
  "/api",
  "",
];

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
const problems = [];
for (const { method, path: specPath } of operations) {
  const methodName = methodMap[method];
  const candidates = routeCandidates(specPath);
  const hasPath = candidates.some((candidate) => routeText.includes(`"${candidate}"`) || routeText.includes(`'${candidate}'`));
  const hasMethod = methodName && new RegExp(`\\b(?:router|app)\\.${methodName}\\s*\\(`).test(routeText);
  if (!hasPath || !hasMethod) {
    problems.push(`${method.toUpperCase()} ${specPath} is documented in OpenAPI but no matching Express path/method was found.`);
  }
}

if (problems.length) {
  console.error("OpenAPI implementation parity failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`OpenAPI implementation parity ok (${operations.length} operations checked)`);
