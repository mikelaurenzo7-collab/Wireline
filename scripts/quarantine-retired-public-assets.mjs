#!/usr/bin/env node
/** Remove retired customer-facing media from the deployable bundle. */
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const distRoot = resolve(process.cwd(), "dist/sounds");
const quarantinedPublicAssets = [
  resolve(distRoot, "wireline-jingle.mp3"),
  resolve(distRoot, "wireline-jingle.mp3.sha256"),
  resolve(distRoot, "botbound-jingle.mp3"),
  resolve(distRoot, "botbound-jingle.mp3.sha256"),
];

for (const asset of quarantinedPublicAssets) {
  rmSync(asset, { force: true });
  if (existsSync(asset)) {
    throw new Error(`Retired public asset remained deployable: ${asset}`);
  }
}

console.log("Retired public media quarantined from the deployable bundle.");
