/**
 * Per-message download link when Director auto-exported a markdown deliverable.
 */
import React from "react";
import { Download } from "lucide-react";
import { cn } from "../../lib/utils";
import { WL_DIRECTOR_CLASSES } from "../../lib/wireline-director-design";
import type { DirectorDeliverableArtifactMeta } from "../../lib/director-message-metadata";

export function DirectorDeliverableDownload({
  artifact,
  className,
}: {
  artifact: DirectorDeliverableArtifactMeta;
  className?: string;
}) {
  if (!artifact.downloadUrl) return null;
  const sizeKb = artifact.sizeBytes > 0 ? Math.max(1, Math.round(artifact.sizeBytes / 1024)) : null;

  return (
    <a
      href={artifact.downloadUrl}
      download={artifact.name}
      className={cn(
        "mt-3 inline-flex items-center gap-2 rounded-md border border-brand/20 bg-brand/[0.05] px-3 py-2 wl-micro-meta font-semibold text-brand hover:bg-brand/10 transition-colors touch-press",
        className,
      )}
    >
      <Download className="w-3.5 h-3.5 shrink-0" aria-hidden />
      <span>Download {artifact.name}</span>
      {sizeKb != null && (
        <span className={cn(WL_DIRECTOR_CLASSES.metaCaption, "font-mono text-muted-foreground")}>
          {sizeKb} KB
        </span>
      )}
    </a>
  );
}
