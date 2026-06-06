import type { DirectorPreviewMeta } from "./director-message-metadata";

export function isStitchPreview(p: Pick<DirectorPreviewMeta, "kind" | "rationale">): boolean {
  if (p.kind === "stitch") return true;
  return /google stitch/i.test(p.rationale || "");
}
