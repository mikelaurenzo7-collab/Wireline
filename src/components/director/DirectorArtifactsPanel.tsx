/**
 * DirectorArtifactsPanel — renders the generated-artifacts gallery
 * (image thumbnails + non-image file cards) that appears between
 * the message list and the composer.
 *
 * Extracted from DirectorWorkspace for code-size reduction.
 */
import { WL_DIRECTOR_CLASSES } from "../../lib/wireline-design-system";
import React from "react";
import { Download, FileText, Image as ImageIcon } from "lucide-react";
import { dedupeDirectorArtifacts } from "../../lib/director-artifact-dedupe";
import { cn } from "../../lib/utils";

import { ArtifactCard, type ArtifactType } from "../ui/ArtifactCard";

export interface DirectorArtifact {
  id: string;
  name: string;
  toolName: string;
  artifactType: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
  downloadUrl: string;
}

export interface DirectorArtifactsPanelProps {
  artifacts: DirectorArtifact[];
}

export default function DirectorArtifactsPanel({ artifacts }: DirectorArtifactsPanelProps) {
  const uniqueArtifacts = dedupeDirectorArtifacts(
    artifacts.map((a) => ({
      ...a,
      createdAt: new Date(a.createdAt),
    })),
  );

  const imageArts = uniqueArtifacts.filter(
    (a) =>
      a.mimeType?.startsWith("image/") || a.artifactType === "svg" || a.artifactType === "image",
  );
  const fileArts = uniqueArtifacts.filter(
    (a) =>
      !a.mimeType?.startsWith("image/") && a.artifactType !== "svg" && a.artifactType !== "image",
  );

  return (
    <div className="shrink-0 px-4 pb-2">
      <div
        className={cn(
          WL_DIRECTOR_CLASSES.composerColumn,
          "rounded-md border border-brand/10 bg-card/75 dark:bg-velvet/45 backdrop-blur-md p-3 space-y-3 shadow-sm shadow-brand/[0.02] transition-all duration-300 hover:shadow-md hover:shadow-brand/[0.04]",
          WL_DIRECTOR_CLASSES.artifactsPanel,
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={cn("wl-label text-muted flex items-center gap-1.5")}>
              <FileText className="w-3 h-3 text-brand/60" />
              Generated artifacts
            </span>
            <span
              className={cn(
                WL_DIRECTOR_CLASSES.metaCaption,
                "font-mono tabular-nums text-muted/50",
              )}
            >
              {uniqueArtifacts.length} file{uniqueArtifacts.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Image artifact thumbnails — the actual logos/visuals */}
        {imageArts.length > 0 && (
          <div>
            <p className="wl-label text-brand/70 font-semibold mb-2 flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3" />
              Media · {imageArts.length} image{imageArts.length !== 1 ? "s" : ""}
            </p>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
              {imageArts.slice(0, 12).map((a) => (
                <div
                  key={a.id}
                  className="group relative rounded-md border border-brand/10 overflow-hidden wl-checkerboard aspect-square transition-all duration-300 hover:border-brand/30 hover:scale-[1.01] hover:shadow-sm"
                >
                  <img
                    src={a.downloadUrl}
                    alt={a.name}
                    className="w-full h-full object-contain p-2 transition-transform duration-500 ease-out group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Hover overlay with download */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 flex flex-col items-center justify-end pb-2">
                    <a
                      href={a.downloadUrl}
                      download={a.name}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-card/95 backdrop-blur-sm wl-label font-semibold text-foreground shadow-lg hover:bg-card transition-colors"
                    >
                      <Download className="w-2.5 h-2.5" />
                      Download
                    </a>
                  </div>
                  {/* File info strip */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent px-2 pt-3 pb-1.5 opacity-100 group-hover:opacity-0 transition-opacity">
                    <p className="wl-micro-meta text-white/90 font-medium truncate leading-tight">
                      {a.name}
                    </p>
                  </div>
                  {/* Format badge */}
                  <div className="absolute top-1.5 right-1.5 px-1 py-0.5 rounded bg-black/40 backdrop-blur-sm text-[var(--wireline-typography-overline-size)] font-mono text-white/80 uppercase font-bold">
                    {a.mimeType?.split("/")[1]?.replace("+xml", "") || a.artifactType}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Non-image artifacts */}
        {fileArts.length > 0 && (
          <div className={cn(imageArts.length > 0 && "pt-2 border-t border-brand/8")}>
            {imageArts.length > 0 && (
              <p className="wl-label text-muted/60 font-semibold mb-2 flex items-center gap-1.5">
                <FileText className="w-3 h-3" />
                Files · {fileArts.length}
              </p>
            )}
            <div className="grid gap-2 max-h-48 overflow-auto sm:grid-cols-2">
              {fileArts.slice(0, 12).map((a) => (
                <ArtifactCard
                  key={a.id}
                  name={a.name}
                  type={a.artifactType as ArtifactType}
                  mimeType={a.mimeType}
                  sizeBytes={a.sizeBytes}
                  downloadUrl={a.downloadUrl}
                  metadata={a.metadata}
                  className="w-full"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
