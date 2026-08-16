import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");
const sanitizerPath = resolve(root, "scripts/sanitize-retired-client-env.mjs");

function canonicalProjectId(): string {
  const source = read("scripts/lib/vercel-project.mjs");
  const match = source.match(/CANONICAL_PROJECT_ID\s*=\s*"([^"]+)"/);
  if (!match?.[1]) throw new Error("Canonical Vercel project ID is missing");
  return match[1];
}

describe("retired client environment sanitizer", () => {
  it("runs through the canonical deployment wrapper", () => {
    const config = JSON.parse(read("vercel.json")) as { buildCommand?: string };
    const deployment = read("scripts/vercel-deploy.mjs");

    expect(config.buildCommand).toBe("node scripts/vercel-deploy.mjs");
    expect(deployment).toContain('import "./sanitize-retired-client-env.mjs";');
    expect(deployment).toContain('run(process.execPath, ["scripts/vercel-build.mjs"]);');
    expect(deployment).toContain(
      'run("npx", ["vitest", "run", "tests/retired-client-env-sanitizer-contract.test.ts"]);',
    );
    expect(deployment).toContain('"--outfile=dist/public-health-api.cjs"');
    expect(deployment).toContain('run(process.execPath, ["scripts/smoke-public-health-bundle.mjs"]);');
  });

  it("removes the retired public key only for canonical production", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        sanitizerPath,
        "-e",
        "process.stdout.write(process.env.VITE_VAPI_PUBLIC_KEY || 'clean')",
      ],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH || "",
          VERCEL_ENV: "production",
          VERCEL_PROJECT_ID: canonicalProjectId(),
          VITE_VAPI_PUBLIC_KEY: "retired-browser-value",
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("clean");
    expect(result.stderr).toContain("removed retired VITE_VAPI_PUBLIC_KEY");
    expect(result.stderr).not.toContain("retired-browser-value");
  });

  it("does not mutate preview or unknown project environments", () => {
    for (const [environment, projectId] of [
      ["preview", canonicalProjectId()],
      ["production", "prj_unknown"],
    ]) {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          sanitizerPath,
          "-e",
          "process.stdout.write(process.env.VITE_VAPI_PUBLIC_KEY || 'clean')",
        ],
        {
          encoding: "utf8",
          env: {
            PATH: process.env.PATH || "",
            VERCEL_ENV: environment,
            VERCEL_PROJECT_ID: projectId,
            VITE_VAPI_PUBLIC_KEY: "retired-browser-value",
          },
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("retired-browser-value");
      expect(result.stderr).toBe("");
    }
  });

  it("keeps the standalone deployment boundary strict", () => {
    const boundary = read("scripts/check-deployment-boundaries.mjs");
    expect(boundary).toContain('if (value("VITE_VAPI_PUBLIC_KEY"))');
    expect(boundary).toContain("retired browser credential must be removed before production");
  });
});
