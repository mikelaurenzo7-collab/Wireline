#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const result = spawnSync(
  process.execPath,
  [
    fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url)),
    "build",
    ...process.argv.slice(2),
  ],
  {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, VISUALIZE: "1" },
    stdio: "inherit",
    windowsHide: true,
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
