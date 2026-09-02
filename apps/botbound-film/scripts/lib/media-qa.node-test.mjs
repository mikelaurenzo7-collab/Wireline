import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertExactMasterSet, assertMediaDelivery, resolveMediaTools } from "./media-qa.mjs";
import {
  OUTBOUND_SOCIAL_DELIVERIES,
  OUTBOUND_VERTICAL_SAFE_ZONE,
  assertOutboundRenderReceipt,
} from "./motion-release.mjs";

const delivery = {
  stem: "master",
  width: 1080,
  height: 1920,
  durationSeconds: 6,
  colorSpace: "bt709",
};
const validProbe = {
  streams: [
    {
      codec_type: "video",
      codec_name: "h264",
      width: 1080,
      height: 1920,
      avg_frame_rate: "30/1",
      r_frame_rate: "60/2",
      nb_frames: "180",
      duration: "6.000000",
      pix_fmt: "yuv420p",
      color_space: "bt709",
    },
    {
      codec_type: "audio",
      codec_name: "aac",
      sample_rate: "48000",
      channels: 2,
      channel_layout: "stereo",
      duration: "6.016000",
    },
  ],
  format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2", duration: "6.016", size: "1000" },
};

test("resolves working Remotion media binaries for this platform", () => {
  const tools = resolveMediaTools(fileURLToPath(new URL("../..", import.meta.url)));
  for (const [name, command] of Object.entries(tools)) {
    const result = spawnSync(command, ["-version"], { encoding: "utf8" });
    assert.equal(
      result.status,
      0,
      `${name} is not executable: ${result.error?.message || result.stderr}`,
    );
  }
});

test("accepts a release-conformant media probe", () => {
  assert.doesNotThrow(() => assertMediaDelivery(validProbe, delivery));
});

test("rejects every release-critical media mismatch", () => {
  for (const mutate of [
    (probe) => (probe.streams[0].codec_name = "vp9"),
    (probe) => (probe.streams[0].width = 720),
    (probe) => (probe.streams[0].avg_frame_rate = "24/1"),
    (probe) => {
      delete probe.streams[0].avg_frame_rate;
      delete probe.streams[0].r_frame_rate;
    },
    (probe) => {
      probe.streams[0].avg_frame_rate = "0/0";
      probe.streams[0].r_frame_rate = "0/0";
    },
    (probe) => (probe.streams[0].nb_frames = "179"),
    (probe) => (probe.streams[0].pix_fmt = "yuv444p"),
    (probe) => (probe.streams[0].color_space = "unknown"),
    (probe) => (probe.streams[1].codec_name = "mp3"),
    (probe) => (probe.streams[1].sample_rate = "44100"),
    (probe) => (probe.streams[1].channels = 1),
    (probe) => (probe.streams[1].channel_layout = "mono"),
    (probe) => (probe.streams[1].duration = "0.25"),
    (probe) => delete probe.streams[1].duration,
    (probe) => (probe.format.duration = "5.5"),
    (probe) => (probe.format.format_name = "matroska"),
  ]) {
    const probe = structuredClone(validProbe);
    mutate(probe);
    assert.throws(() => assertMediaDelivery(probe, delivery), /failed delivery QA/);
  }
});

test("requires an exact three-master release set", () => {
  const directory = mkdtempSync(join(tmpdir(), "botbound-media-qa-"));
  const deliveries = ["one", "two", "three"].map((stem) => ({ stem }));
  assert.throws(() => assertExactMasterSet(directory, deliveries), /missing/);
  for (const { stem } of deliveries) writeFileSync(join(directory, `${stem}.mp4`), "x");
  assert.doesNotThrow(() => assertExactMasterSet(directory, deliveries));
  writeFileSync(join(directory, "old-master.mp4"), "x");
  assert.throws(() => assertExactMasterSet(directory, deliveries), /unexpected: old-master\.mp4/);
});

test("pins the First Move receipt to exactly three provenance-bound masters", () => {
  assert.equal(OUTBOUND_SOCIAL_DELIVERIES.length, 3);
  const currentContext = { sourceFingerprint: "source-fingerprint" };
  const receipt = {
    schema: "botbound.outbound-motion-render.v1",
    campaign: "THE FIRST MOVE",
    sourceFingerprint: currentContext.sourceFingerprint,
    masters: OUTBOUND_SOCIAL_DELIVERIES.map(({ composition, fileName }) => ({
      composition,
      file: fileName,
      bytes: 1000,
      sha256: "a".repeat(64),
    })),
  };

  assert.doesNotThrow(() => assertOutboundRenderReceipt(receipt, currentContext));
  assert.throws(
    () =>
      assertOutboundRenderReceipt(
        { ...receipt, sourceFingerprint: "changed-after-render" },
        currentContext,
      ),
    /changed after the masters were rendered/,
  );
  assert.throws(
    () =>
      assertOutboundRenderReceipt(
        { ...receipt, masters: receipt.masters.slice(0, 2) },
        currentContext,
      ),
    /exact approved 6s\/10s\/15s master set/,
  );
});

test("keeps vertical brand and status chrome inside the published social safe zone", () => {
  assert.deepEqual(OUTBOUND_VERTICAL_SAFE_ZONE, { top: 220, right: 144, bottom: 340, left: 96 });
  const chrome = readFileSync(
    fileURLToPath(new URL("../../src/outbound/OutboundChrome.tsx", import.meta.url)),
    "utf8",
  );
  const callScene = readFileSync(
    fileURLToPath(new URL("../../src/outbound/scenes/CallScene.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(chrome, /top: 220/);
  assert.match(chrome, /right: 144/);
  assert.match(chrome, /bottom: 340/);
  assert.match(chrome, /left: 96/);
  assert.match(callScene, /top: 1508/);
  assert.doesNotMatch(callScene, /top: 1720/);
});
