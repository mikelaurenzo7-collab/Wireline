/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useState, useRef } from "react";
import { Download, Upload, CheckCircle2, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface Props {
  agentId: string;
  agentName: string;
}

export default function AgentExportImport({ agentId, agentName }: Props) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [imported, setImported] = useState<{ directives: number; knowledge: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await authFetch(`/api/agents/${agentId}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${agentName.replace(/\s+/g, "_")}_config.json`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess("Config exported", `${agentName} configuration downloaded.`);
    } catch {
      toastError("Export failed", "Could not export agent configuration.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reject obviously-bad files before reading them — most exports are
    // < 100KB; we cap at 5MB to avoid OOM if the user picks the wrong file.
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toastError("Import failed", "File is too large (max 5 MB).");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setIsImporting(true);
    setImported(null);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error("File is not valid JSON.");
      }
      // Smoke-check the export shape so we don't post arbitrary user data.
      if (!payload || typeof payload !== "object") {
        throw new Error("Export file is malformed (expected an object).");
      }
      const res = await authFetch(`/api/agents/${agentId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Import failed");
      }
      const data = await res.json();
      setImported(data.imported);
      toastSuccess(
        "Config imported",
        `${data.imported?.directives ?? 0} directives + ${data.imported?.knowledge ?? 0} knowledge items merged.`,
      );
    } catch (err: any) {
      toastError("Import failed", err?.message || "Invalid file format.");
    } finally {
      setIsImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Export */}
      <ShadButton
        type="button"
        variant="outline"
        size="sm"
        disableAnimations
        onClick={handleExport}
        disabled={isExporting}
        className="h-8 rounded-full border-white/10 px-3 wl-micro-meta hover:border-brand/30 hover:text-brand disabled:opacity-40"
        title="Export agent config as JSON"
      >
        {isExporting ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Download className="w-3 h-3" />
        )}
        Export
      </ShadButton>

      {/* Import */}
      <Input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
      <ShadButton
        type="button"
        variant="outline"
        size="sm"
        disableAnimations
        onClick={() => fileRef.current?.click()}
        disabled={isImporting}
        className="h-8 rounded-full border-white/10 px-3 wl-micro-meta hover:border-brand/30 hover:text-brand disabled:opacity-40"
        title="Import agent config from JSON"
      >
        {isImporting ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Upload className="w-3 h-3" />
        )}
        Import
      </ShadButton>

      {/* Success flash */}
      <AnimatePresence>
        {imported && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-brand wl-label"
          >
            <CheckCircle2 className="w-3 h-3" />
            Merged
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
