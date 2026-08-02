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
