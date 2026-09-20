import { createHash } from "node:crypto";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import {
  assertProductProofManifest,
  proofContactSheetName,
  proofFrameNames,
  verifiedProofFrameBytes,
} from "./product-proof-files.mjs";

const labels = [
  "HOME · DESKTOP",
  "HOME · MOBILE",
  "FEATURES · DESKTOP",
  "FEATURES · MOBILE",
  "PRICING · DESKTOP",
  "PRICING · MOBILE",
  "SIGN IN · DESKTOP",
];

export function renderProductProofContactSheet(repositoryRoot, proofRoot, manifest) {
  assertProductProofManifest(manifest);
  const results = new Map(
    manifest.results.map((result) => [String(result.output).split(/[\\/]/).at(-1), result]),
  );
  const frameBytes = new Map();
  const tiles = proofFrameNames
    .map((filename, index) => {
      const bytes = verifiedProofFrameBytes(proofRoot, results.get(filename));
      frameBytes.set(filename, bytes);
      const data = bytes.toString("base64");
      const x = 52 + (index % 4) * 455;
      const y = 214 + Math.floor(index / 4) * 554;
      return (
        '<rect x="' +
        x +
        '" y="' +
        y +
        '" width="432" height="518" rx="24" fill="#111018" stroke="#3A334B" stroke-width="2"/>' +
        '<image href="data:image/png;base64,' +
        data +
        '" x="' +
        (x + 18) +
        '" y="' +
        (y + 18) +
        '" width="396" height="430" preserveAspectRatio="xMidYMid meet"/>' +
        '<text x="' +
        (x + 22) +
        '" y="' +
        (y + 483) +
        '" fill="#F5F4F8" font-family="IBM Plex Mono" font-size="16" font-weight="700" letter-spacing="1.6">' +
        labels[index] +
        "</text>"
      );
    })
    .join("");
  const notes = [
    "7 verified public frames",
    "Simulated APIs",
    "Paid activation paused",
    "No live credentials",
    "Review full-size frames",
  ];
  const noteMarkup = notes
    .map(
      (note, index) =>
        '<text x="1440" y="' +
        (880 + index * 48) +
        '" fill="#B6B1C6" font-family="Inter" font-size="23">' +
        note +
        "</text>",
    )
    .join("");
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1400" viewBox="0 0 1920 1400">' +
    '<rect width="1920" height="1400" fill="#08080D"/>' +
    '<text x="54" y="74" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="17" font-weight="700" letter-spacing="3.6">BOTBOUND · PUBLIC UI REVIEW · ' +
    new Date(manifest.capturedAt).toISOString().slice(0, 10) +
    "</text>" +
    '<text x="52" y="142" fill="#F5F4F8" font-family="Inter Tight" font-size="54" font-weight="800" letter-spacing="-2">EXACT WORKTREE PREVIEW</text>' +
    '<text x="52" y="183" fill="#A78BFA" font-family="Inter" font-size="24" font-weight="700">Not deployed production · simulated APIs · ' +
    (manifest.revision.dirty ? "dirty" : "clean") +
    " worktree at " +
    manifest.revision.commit.slice(0, 8) +
    "</text>" +
    tiles +
    '<text x="1440" y="820" fill="#C4B5FD" font-family="IBM Plex Mono" font-size="18" font-weight="700">INTERNAL REVIEW ONLY</text>' +
    noteMarkup +
    '<line x1="54" y1="1326" x2="1866" y2="1326" stroke="#8B5CF6" stroke-width="3"/>' +
    '<text x="54" y="1366" fill="#B6B1C6" font-family="Inter" font-size="20">Sign-in behavior, live calls, billing, authenticated Studio, and deployed runtime are not verified by these images.</text></svg>';
  const fontFiles = [
    "InterTight-ExtraBold.ttf",
    "Inter-Regular.ttf",
    "Inter-Bold.ttf",
    "IBMPlexMono-Bold.ttf",
  ].map((name) => path.join(repositoryRoot, "brand-work", "fonts", name));
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: 1920 },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Inter" },
  })
    .render()
    .asPng();
  return {
    png,
    frameBytes,
    contactSheet: {
      file: proofContactSheetName,
      bytes: png.byteLength,
      sha256: createHash("sha256").update(png).digest("hex"),
    },
  };
}
