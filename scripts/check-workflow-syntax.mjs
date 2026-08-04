import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as prettier from "prettier";

const root = process.cwd();
const workflowsDir = resolve(root, ".github/workflows");
const workflowFiles = (await readdir(workflowsDir)).filter((name) => /\.ya?ml$/i.test(name)).sort();

if (workflowFiles.length === 0) {
  throw new Error("No GitHub Actions workflow files were found.");
}

const failures = [];
const mutableNpmInstallPattern = /^\s*(?:-\s*)?run:\s*npm install(?:\s|$)/m;
const publicModelStatusReadinessPattern = /curl[^\n]*\/api\/health\/public\b/;
const actionRefPattern =
  /^\s*(?:-\s*)?uses:\s*(actions\/checkout|actions\/setup-node|actions\/github-script|github\/codeql-action\/(?:init|analyze|upload-sarif))@v(\d+)\s*$/gm;
const minimumActionMajors = new Map([
  ["actions/checkout", 7],
  ["actions/setup-node", 7],
  ["actions/github-script", 9],
  ["github/codeql-action", 4],
]);

for (const name of workflowFiles) {
  const path = resolve(workflowsDir, name);
  try {
    const source = await readFile(path, "utf8");
    // Formatting is intentionally discarded: Prettier's YAML parser gives the
    // normal verification ladder a syntax gate before GitHub can silently omit
    // a malformed workflow from pull-request checks.
    await prettier.format(source, { filepath: path, parser: "yaml" });

    if (mutableNpmInstallPattern.test(source)) {
      failures.push({
        name,
        message: "workflow dependency installs must use npm ci with the committed lockfile",
      });
    }

    if (publicModelStatusReadinessPattern.test(source)) {
      failures.push({
        name,
        message:
          "process readiness must not call /api/health/public; probe the local application surface instead",
      });
    }

    for (const match of source.matchAll(actionRefPattern)) {
      const action = match[1];
      const canonicalAction = action.startsWith("github/codeql-action/")
        ? "github/codeql-action"
        : action;
      const major = Number.parseInt(match[2], 10);
      const minimum = minimumActionMajors.get(canonicalAction);
      if (minimum != null && major < minimum) {
        failures.push({
          name,
          message: `${canonicalAction}@v${major} is below the supported v${minimum} minimum`,
        });
      }
    }

    if (source.includes("actions/github-script@v9")) {
      if (/require\(["']@actions\/github["']\)/.test(source)) {
        failures.push({
          name,
          message: "github-script v9 workflows must use the injected GitHub client",
        });
      }
      if (/^\s*(?:const|let)\s+getOctokit\b/m.test(source)) {
        failures.push({
          name,
          message: "github-script v9 injects getOctokit; const/let redeclaration is invalid",
        });
      }
    }
  } catch (error) {
    failures.push({
      name,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

if (failures.length > 0) {
  console.error("GitHub Actions workflow validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure.name}: ${failure.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Validated ${workflowFiles.length} GitHub Actions workflow files.`);
}
