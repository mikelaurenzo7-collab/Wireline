import { type ChangeEvent, useState } from "react";
import { FileText, Loader2, UploadCloud } from "lucide-react";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules";
import { authFetch, safeJson } from "../lib/api";

type AssetBody = {
  fileName: string;
  mimeType: string;
  text?: string;
  dataUrl?: string;
};

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}

async function readAsset(file: File): Promise<AssetBody> {
  const mimeType = file.type || "text/plain";
  if (/^image\/(png|jpe?g|webp|gif)$/.test(mimeType)) {
    return { fileName: file.name, mimeType, dataUrl: await readAsDataUrl(file) };
  }
  return { fileName: file.name, mimeType, text: await file.text() };
}

export default function AgentAssetUpload({ agentId, onComplete }: { agentId: string; onComplete?: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.target.files || []).slice(0, 5));
    setMessage("");
    setError("");
  }

  async function upload() {
    if (!agentId || !files.length || uploading) return;
    setUploading(true);
    setMessage("");
    setError("");
    try {
      const summaries: string[] = [];
      for (const file of files) {
        const payload = await readAsset(file);
        const response = await authFetch(`/api/agent-config/${encodeURIComponent(agentId)}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await safeJson(response) as { summary?: string; error?: string } | null;
        if (!response.ok) throw new Error(body?.error || `${file.name} could not be ingested.`);
        if (body?.summary) summaries.push(body.summary);
      }
      setFiles([]);
      setMessage(summaries.join(" ") || "Source ingested.");
      onComplete?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Source could not be ingested.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--wireline-elevation-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="wl-overline">Sources</p>
          <h2 className="mt-1 text-[var(--wireline-typography-h3-size)] font-semibold tracking-[-.03em] text-foreground">Upload documents</h2>
          <p className="mt-1 text-sm text-muted-foreground">Ingest files. Feed facts.</p>
        </div>
        <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>

      <label className="mt-4 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-4 py-5 text-center transition-colors hover:border-primary/35 hover:bg-muted">
        <UploadCloud className="size-5 text-muted-foreground" aria-hidden="true" />
        <span className="mt-2 text-sm font-medium text-foreground">Add files</span>
        <span className="mt-1 text-xs text-muted-foreground">TXT, MD, CSV, JSON, PNG, JPG, WEBP, GIF</span>
        <input type="file" multiple accept="text/*,.txt,.md,.csv,.json,image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={onChange} />
      </label>

      {files.length ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{files.map((file) => file.name).join(", ")}</p> : null}
      {message ? <StatusNotice tone="success" className="mt-3" title="Ingested">{message}</StatusNotice> : null}
      {error ? <StatusNotice tone="destructive" className="mt-3" title="Upload failed">{error}</StatusNotice> : null}
      <Button type="button" disabled={!files.length || uploading || !agentId} onClick={() => void upload()} className="mt-4 w-full justify-center">
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud size={15} />}
        Ingest source
      </Button>
    </section>
  );
}
