/**
 * ArtifactCard — Shared component for displaying generated file artifacts
 * in chat with type-specific inline previews and download buttons.
 *
 * Supports: SVG (rendered), Markdown (rendered), Audio (player),
 * PDF (icon + metadata), Code (syntax-highlighted block), CSV/JSON (table preview).
 */
import React, { useState } from "react";
import { ShadButton } from "./shadcn/ShadButton";
import { motion } from "motion/react";
import {
  Download,
  FileText,
  Image,
  Music,
  Code,
  Table2,
  FileArchive,
  Eye,
  ExternalLink,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { safeSvgPreviewDataUrl } from "../../lib/sanitize-svg-preview";

export type ArtifactType =
  "svg" | "markdown" | "pdf" | "audio" | "code" | "csv" | "json" | "zip" | "image" | "unknown";

export interface ArtifactCardProps {
  /** Display name for the file. */
  name: string;
  /** Type for rendering the correct preview. */
  type: ArtifactType;
  /** MIME type of the file. */
  mimeType?: string;
  /** File size in bytes. */
  sizeBytes?: number;
  /** Signed download URL. */
  downloadUrl?: string;
  /** Inline preview data (base64 data URL for images, raw SVG string, etc). */
  previewData?: string;
  /** Additional metadata to display. */
  metadata?: Record<string, unknown>;
  className?: string;
}

const TYPE_ICONS: Record<ArtifactType, React.ElementType> = {
  svg: Image,
  image: Image,
  markdown: FileText,
  pdf: FileText,
  audio: Music,
  code: Code,
  csv: Table2,
  json: Code,
  zip: FileArchive,
  unknown: FileText,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function inferType(mimeType?: string, name?: string): ArtifactType {
  if (mimeType?.includes("svg")) return "svg";
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.includes("pdf")) return "pdf";
  if (mimeType?.startsWith("audio/")) return "audio";
  if (mimeType?.includes("zip") || mimeType?.includes("archive")) return "zip";
  if (mimeType?.includes("json")) return "json";
  if (mimeType?.includes("csv") || mimeType?.includes("spreadsheet")) return "csv";
  if (mimeType?.includes("markdown") || name?.endsWith(".md")) return "markdown";
  if (name?.match(/\.(ts|js|py|go|rs|rb|java|c|cpp|h|sh|bash|yaml|yml|toml)$/)) return "code";
  return "unknown";
}

export function ArtifactCard({
  name,
  type: explicitType,
  mimeType,
  sizeBytes,
  downloadUrl,
  previewData,
  className,
}: ArtifactCardProps) {
  const type: ArtifactType =
    explicitType && explicitType in TYPE_ICONS ? explicitType : inferType(mimeType, name);
  const Icon = TYPE_ICONS[type] ?? FileText;

  const isImageType = type === "image" || type === "svg";
  const svgPreviewSrc = type === "svg" && previewData ? safeSvgPreviewDataUrl(previewData) : null;
  const effectivePreview =
    (type === "svg" ? svgPreviewSrc : previewData) ||
    (isImageType && downloadUrl ? downloadUrl : undefined);
  const [showPreview, setShowPreview] = useState(isImageType && !!effectivePreview);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "group rounded-md border border-brand/15 bg-card/90 dark:bg-card/90 backdrop-blur-sm",
        "shadow-sm hover:shadow-md transition-all duration-200",
        isImageType ? "overflow-hidden" : "p-3",
        className,
      )}
    >
      {/* Auto-show image preview at top */}
      {isImageType && effectivePreview && (
        <div className="relative wl-checkerboard">
          <img
            src={effectivePreview}
            alt={name}
            className="w-full max-h-44 object-contain p-3"
            loading="lazy"
          />
          {/* Hover download overlay */}
          {downloadUrl && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <a
                href={downloadUrl}
                download={name}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/95 backdrop-blur-sm wl-label font-semibold text-foreground shadow-lg hover:bg-card transition-colors"
                title="Download"
              >
                <Download className="w-3 h-3" />
                Download
              </a>
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/85 backdrop-blur-sm wl-micro-meta font-medium text-foreground/80 hover:bg-card/95 transition-colors"
                title="Open"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Header row */}
      <div className={cn("flex items-center gap-2.5", isImageType && "px-3 py-2.5")}>
        <span
          className={cn(
            "flex-shrink-0 flex w-8 h-8 items-center justify-center rounded-md",
            isImageType ? "bg-brand/10 text-brand" : "bg-brand/8 text-brand",
          )}
        >
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[length:var(--wireline-typography-caption-size)] font-medium text-foreground truncate">
            {name}
          </p>
          <p className="wl-micro-meta--muted">
            {type.toUpperCase()}
            {sizeBytes != null && ` · ${formatBytes(sizeBytes)}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {effectivePreview && !isImageType && (
            <ShadButton
              type="button"
              disableAnimations
              variant="ghost"
              size="icon"
              onClick={() => setShowPreview(!showPreview)}
              className="h-8 w-8 hover:bg-brand/8 text-muted hover:text-brand after:hidden"
              title="Preview"
              aria-label={showPreview ? "Hide preview" : "Show preview"}
            >
              <Eye className="w-3.5 h-3.5" />
            </ShadButton>
          )}
          {downloadUrl && !isImageType && (
            <a
              href={downloadUrl}
              download={name}
              className="p-1.5 rounded-md hover:bg-brand/8 text-muted hover:text-brand transition-colors"
              title="Download"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
          {downloadUrl && !isImageType && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-brand/8 text-muted hover:text-brand transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Inline preview for non-image types */}
      {showPreview && effectivePreview && !isImageType && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="mt-2 pt-2 border-t border-brand/10 overflow-hidden"
        >
          {type === "audio" && (
            <audio controls className="w-full" src={effectivePreview}>
              Your browser doesn&apos;t support audio.
            </audio>
          )}
          {(type === "code" || type === "json" || type === "markdown") && (
            <pre className="wl-micro-badge font-mono text-muted max-h-48 overflow-auto p-2 rounded-md bg-black/5">
              {effectivePreview}
            </pre>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
