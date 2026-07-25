#!/usr/bin/env node
/**
 * LiveAvatar Web SDK 0.0.18 sends raw PCM bytes inside JSON for agent.speak.
 * The LiveAvatar control plane expects base64 (see heygen-com/live-avatar-js-sdk#103).
 * Until an upstream release lands, rewrite the one send site after install.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const targets = [
  "node_modules/@heygen/liveavatar-web-sdk/lib/index.esm.js",
  "node_modules/@heygen/liveavatar-web-sdk/lib/index.cjs.js",
];

const NEEDLE = `this._sessionEventSocket.send(JSON.stringify({
                        type: "agent.speak",
                        event_id: event_id,
                        audio: audioChunk,
                    }));`;

const REPLACEMENT = `this._sessionEventSocket.send(JSON.stringify({
                        type: "agent.speak",
                        event_id: event_id,
                        audio: typeof btoa === "function" ? btoa(audioChunk) : Buffer.from(audioChunk, "binary").toString("base64"),
                    }));`;

let patched = 0;
for (const relative of targets) {
  const path = resolve(process.cwd(), relative);
  if (!existsSync(path)) continue;
  const before = readFileSync(path, "utf8");
  if (before.includes('audio: typeof btoa === "function" ? btoa(audioChunk)')) {
    continue;
  }
  if (!before.includes(NEEDLE)) {
    console.warn(`[patch-liveavatar-sdk] pattern missing in ${relative} — skip`);
    continue;
  }
  writeFileSync(path, before.replace(NEEDLE, REPLACEMENT));
  patched += 1;
  console.log(`[patch-liveavatar-sdk] patched ${relative}`);
}

if (patched === 0) {
  console.log("[patch-liveavatar-sdk] already applied or SDK absent");
}
