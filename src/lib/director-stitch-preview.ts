import type { DirectorPreviewMeta } from "./director-message-metadata";

export function isStitchPreview(p: Pick<DirectorPreviewMeta, "kind" | "rationale">): boolean {
  if (p.kind === "stitch") return true;
  return /google stitch/i.test(p.rationale || "");
}

export interface LatestStitchPreview {
  messageId: string;
  preview: DirectorPreviewMeta;
  previews: DirectorPreviewMeta[];
}

/** Most recent Stitch render in the thread — drives the optional Design preview side entry. */
export function findLatestStitchPreview(
  messages: Array<{ id: string; role: string; previews?: DirectorPreviewMeta[] }>,
): LatestStitchPreview | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.role !== "director" || !m.previews?.length) continue;
    const first = m.previews[0];
    if (!first || !isStitchPreview(first)) continue;
    return { messageId: m.id, preview: first, previews: m.previews };
  }
  return null;
}
