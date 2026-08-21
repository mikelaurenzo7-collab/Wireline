#!/usr/bin/env node
/** Remove retired customer-facing media from the deployable bundle. */
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const distRoot = resolve(process.cwd(), "dist/sounds");
const approvedBotBoundJingle = process.env.BOTBOUND_JINGLE_ASSET_APPROVED === "true";
const botBoundJingle = resolve(distRoot, "botbound-jingle.mp3");
const quarantinedPublicAssets = [
  resolve(distRoot, "wireline-jingle.mp3"),
  resolve(distRoot, "wireline-jingle.mp3.sha256"),
  resolve(distRoot, "botbound-jingle.mp3.sha256"),
  ...(!approvedBotBoundJingle ? [botBoundJingle] : []),
];

for (const asset of quarantinedPublicAssets) {
  rmSync(asset, { force: true });
  if (existsSync(asset)) {
    throw new Error(`Retired public asset remained deployable: ${asset}`);
  }
}

if (approvedBotBoundJingle && !existsSync(botBoundJingle)) {
  throw new Error("Approved BotBound jingle was not copied into the deployable bundle.");
}

console.log("Retired public media quarantined from the deployable bundle.");
