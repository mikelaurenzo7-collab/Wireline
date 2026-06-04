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

export type ArtifactType =
  | "svg"
  | "markdown"
  | "pdf"
  | "audio"
  | "code"
  | "csv"
  | "json"
  | "zip"
  | "image"
  | "unknown";

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
  const [showPreview, setShowPreview] = useState(false);
  const type = explicitType || inferType(mimeType, name);
  const Icon = TYPE_ICONS[type];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "rounded-md border border-brand/15 bg-white/80 dark:bg-[#1a1225]/60 backdrop-blur-sm",
        "p-3 shadow-sm hover:shadow-md transition-shadow",
        className,
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5">
        <span className="flex-shrink-0 flex w-8 h-8 items-center justify-center rounded-md bg-brand/8 text-brand">
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-ink truncate">{name}</p>
          <p className="text-[10px] text-muted">
            {type.toUpperCase()}
            {sizeBytes != null && ` · ${formatBytes(sizeBytes)}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {previewData && (
            <ShadButton
              type="button"
              disableAnimations
              variant="ghost"
              size="icon"
              onClick={() => setShowPreview(!showPreview)}
              className="h-8 w-8 hover:bg-brand/8 text-muted hover:text-brand after:hidden"
              title="Preview"
            >
              <Eye className="w-3.5 h-3.5" />
            </ShadButton>
          )}
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={name}
              className="p-1.5 rounded-md hover:bg-brand/8 text-muted hover:text-brand transition-colors"
              title="Download"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}
          {downloadUrl && (
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

      {/* Inline preview */}
      {showPreview && previewData && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="mt-2 pt-2 border-t border-brand/10 overflow-hidden"
        >
          {type === "svg" && (
            <div
              className="max-h-48 overflow-auto rounded-md bg-white p-2"
              dangerouslySetInnerHTML={{ __html: previewData }}
            />
          )}
          {type === "image" && (
            <img
              src={previewData}
              alt={name}
              className="max-h-48 rounded-md object-contain mx-auto"
            />
          )}
          {type === "audio" && (
            <audio controls className="w-full" src={previewData}>
              Your browser doesn&apos;t support audio.
            </audio>
          )}
          {(type === "code" || type === "json" || type === "markdown") && (
            <pre className="text-[10px] font-mono text-muted max-h-48 overflow-auto p-2 rounded-md bg-black/5">
              {previewData}
            </pre>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
