import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { verifyNativePackage } from "./native-package-preflight.mjs";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [action, target] = process.argv.slice(2);
if (!["package", "make"].includes(action) || !["win32", "darwin"].includes(target)) {
  throw new Error("Use distribute.mjs package|make win32|darwin.");
}
if (process.platform !== target) {
  throw new Error(
    `Build ${target} artifacts on a ${target} host so the native helper matches the operating system.`,
  );
}
const run = (entry, args = []) => {
  const result = spawnSync(process.execPath, [entry, ...args], { cwd: appRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};
run(resolve(appRoot, "native/build.mjs"), ["--platform", target, "--arch", process.arch]);
await verifyNativePackage(appRoot, target, process.arch);
run(resolve(appRoot, "scripts/build.mjs"));
const require = createRequire(import.meta.url);
const forgePackage = require.resolve("@electron-forge/cli/package.json");
const forge = JSON.parse(readFileSync(forgePackage, "utf8"));
run(resolve(dirname(forgePackage), forge.bin["electron-forge"]), [
  action,
  "--platform",
  target,
  "--arch",
  process.arch,
]);
console.log(
  "Local desktop artifacts created. They are unsigned development artifacts, not a certified public release.",
);
