#!/usr/bin/env node
import { validateBotBoundJingleAsset } from "./generate-jingle.mjs";

if (process.env.BOTBOUND_JINGLE_ASSET_APPROVED === "true") {
  if (!(await validateBotBoundJingleAsset())) {
    throw new Error(
      "BOTBOUND_JINGLE_ASSET_APPROVED=true requires a present, brand-safe jingle whose recipe and audio hashes match its provenance sidecar.",
    );
  }
  console.log("Approved BotBound jingle provenance validated.");
} else {
  console.log("BotBound jingle approval is off; the build will ship the spoken fallback.");
}
