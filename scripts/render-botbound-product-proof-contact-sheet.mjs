import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  acquireProductProofLock,
  assertContainedPath,
  assertProofOutputDirectory,
  proofContactSheetName,
  proofFrameNames,
  proofManifestName,
  publishProofFiles,
} from "./lib/product-proof-files.mjs";
import { renderProductProofContactSheet } from "./lib/product-proof-contact-sheet.mjs";
import { readProductProofSource } from "./lib/product-proof-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.resolve(
  root,
  process.env.BOTBOUND_CAPTURE_OUTPUT_DIR ?? "brand-work/launch-2026-09/exports/product-proof",
);
assertProofOutputDirectory(root, outputDir);
const releaseProofLock = acquireProductProofLock(root, {
  purpose: "contact-sheet",
  pid: process.pid,
});
try {
  const manifest = JSON.parse(readFileSync(path.join(outputDir, proofManifestName), "utf8"));
  const source = readProductProofSource(root);
  if (
    manifest.revision?.commit !== source.revision.commit ||
    manifest.sourceSnapshot?.sha256 !== source.sourceSnapshot.sha256
  ) {
    throw new Error(
      "Product proof is stale. Run npm run brand:proof against the current worktree first.",
    );
  }
  const rendered = renderProductProofContactSheet(root, outputDir, manifest);
  const stagingParent = path.join(outputDir, "_rejected");
  mkdirSync(stagingParent, { recursive: true });
  assertContainedPath(realpathSync(outputDir), realpathSync(stagingParent));
  const stagingDir = mkdtempSync(path.join(stagingParent, ".botbound-contact-sheet-"));
  try {
    for (const [name, bytes] of rendered.frameBytes)
      writeFileSync(path.join(stagingDir, name), bytes);
    writeFileSync(
      path.join(stagingDir, "README.md"),
      readFileSync(path.join(outputDir, "README.md")),
    );
    writeFileSync(path.join(stagingDir, proofContactSheetName), rendered.png);
    writeFileSync(
      path.join(stagingDir, proofManifestName),
      JSON.stringify({ ...manifest, contactSheet: rendered.contactSheet }, null, 2) + "\n",
    );
    if (source.sourceSnapshot.sha256 !== readProductProofSource(root).sourceSnapshot.sha256)
      throw new Error(
        "Public source changed during contact-sheet generation; prior proof remains unchanged.",
      );
    publishProofFiles({
      outputDir,
      stagingDir,
      fileNames: [...proofFrameNames, "README.md", proofContactSheetName, proofManifestName],
    });
    console.log(path.join(outputDir, proofContactSheetName));
  } finally {
    assertContainedPath(realpathSync(outputDir), realpathSync(stagingDir));
    rmSync(stagingDir, { recursive: true, force: true });
  }
} finally {
  releaseProofLock();
}
