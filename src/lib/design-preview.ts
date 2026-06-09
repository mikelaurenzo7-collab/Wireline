import type { DirectorPreviewMeta } from "./director-message-metadata";

export function isStitchPreview(p: Pick<DirectorPreviewMeta, "kind" | "rationale">): boolean {
  if (p.kind === "stitch") return true;
  // Legacy persisted previews from the retired Google Stitch integration.
  return /google stitch/i.test(p.rationale || "");
}

/** Stable identity for a render across a thread (renderId preferred, conceptId fallback). */
export function stitchPreviewKey(p: Pick<DirectorPreviewMeta, "renderId" | "conceptId">): string {
  return p.renderId || p.conceptId;
}

/**
 * Assign chronological version numbers (v1, v2, …) to every distinct Stitch
 * render in a thread. Drives the Painter "version history" strip so the latest
 * render carries the highest number and re-renders of the same concept reuse it.
 */
export function assignStitchPreviewVersions(
  messages: Array<{ role: string; previews?: DirectorPreviewMeta[] }>,
): Map<string, number> {
  const versions = new Map<string, number>();
  let version = 0;
  for (const m of messages) {
    if (m.role !== "director" || !m.previews) continue;
    for (const p of m.previews) {
      if (!isStitchPreview(p)) continue;
      const key = stitchPreviewKey(p);
      if (!versions.has(key)) {
        version += 1;
        versions.set(key, version);
      }
    }
  }
  return versions;
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
