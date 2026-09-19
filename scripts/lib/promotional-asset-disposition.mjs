import path from "node:path";

export const promotionalAssetClassificationPolicy = {
  basis: "path-and-file-signature-only",
  release_approval: "not-assessed",
  source_currency: "not-assessed",
};

const creativeExtensions = new Set([
  ".gif",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".svg",
  ".wav",
  ".webm",
  ".webp",
  ".zip",
]);

/** Inventory categories describe a file's role; they never certify a release. */
export function promotionalAssetDisposition(relative, extensionMatchesDetectedFormat = null) {
  const normalized = relative.replaceAll("\\", "/");
  const extension = path.posix.extname(normalized).toLowerCase();
  const isCreative = creativeExtensions.has(extension);

  if (extensionMatchesDetectedFormat === false) return "quarantine-extension-mismatch";
  if (normalized.includes("/_rejected/") || normalized.includes("/rejected/"))
    return "quarantine-rejected-review";
  if (
    normalized.includes("botbound-outbound-motion-drafts-2026-09-01") ||
    normalized.includes("candidate-browser-gate") ||
    normalized.startsWith("artifacts/creative-audit-2026-09-01/")
  )
    return "historical-quarantine-review";
  if (
    normalized.includes("/product-proof/") ||
    normalized.includes("botbound-outbound-website-pass-2026-09-01")
  )
    return "internal-worktree-proof-not-release";
  if (normalized.startsWith("artifacts/") || /\/(?:qa|contact-sheet)\//.test(normalized))
    return "internal-qa-only";
  if (
    normalized.includes("/archive/") ||
    normalized.startsWith("brand-work/exports/") ||
    normalized.startsWith("brand-work/launch-stills/")
  )
    return "historical-creative-review";
  if (extension === ".srt" || extension === ".vtt") return "caption-sidecar-review";

  const campaign = normalized.startsWith("brand-work/launch-2026-09-outbound/")
    ? "outbound"
    : normalized.startsWith("brand-work/launch-2026-09/")
      ? "inbound"
      : null;
  if (campaign) {
    if (normalized.includes("/sources/")) return `${campaign}-creative-source`;
    return isCreative ? `${campaign}-creative-candidate` : `${campaign}-copy-or-control-source`;
  }
  if (normalized.startsWith("brand-work/gtm/"))
    return isCreative ? "gtm-creative-candidate" : "gtm-copy-or-control-source";
  if (normalized.startsWith("apps/botbound-film/out/")) return "motion-render-review";
  if (normalized.startsWith("apps/botbound-film/"))
    return isCreative ? "motion-source-media" : "motion-source";
  if (/^brand-work\/(?:logo-motion|cinematic-call-campaign)-/.test(normalized))
    return isCreative ? "motion-creative-candidate" : "motion-copy-or-control-source";
  if (
    normalized.startsWith("public/") ||
    normalized.startsWith("android/") ||
    normalized.startsWith("ios/") ||
    normalized.startsWith("apps/browser-extension/")
  )
    return "product-package-asset-review";
  if (normalized.startsWith("docs/")) return "launch-reference-review";
  return isCreative ? "brand-creative-candidate" : "brand-source-or-control";
}
