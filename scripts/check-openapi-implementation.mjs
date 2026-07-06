#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = path.join(os.tmpdir(), `wireline-openapi-${process.pid}.mjs`);
writeFileSync(
  tmp,
  `import { listSpecOperations } from ${JSON.stringify(path.resolve("src/lib/openapi-spec.ts"))};\nconsole.log(JSON.stringify(listSpecOperations()));\n`,
);
let operations;
try {
  operations = JSON.parse(execFileSync("npx", ["tsx", tmp], { encoding: "utf8" }));
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

const routeText = walk("src/routes")
  .concat(["server.ts", "src/server/register-api-routes.ts"])
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
