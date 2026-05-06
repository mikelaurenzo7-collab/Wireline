import { useState, useRef } from "react";
import { Download, Upload, CheckCircle2, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

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
    setIsImporting(true);
    setImported(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await authFetch(`/api/agents/${agentId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Import failed");
      }
      const data = await res.json();
      setImported(data.imported);
      toastSuccess(
        "Config imported",
        `${data.imported.directives} directives + ${data.imported.knowledge} knowledge items merged.`
      );
    } catch (err: any) {
      toastError("Import failed", err.message || "Invalid file format.");
    } finally {
      setIsImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Export */}
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="h-8 px-3 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/60 hover:text-brand hover:border-brand/30 transition-all flex items-center gap-1.5 disabled:opacity-40"
        title="Export agent config as JSON"
      >
        {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
        Export
      </button>

      {/* Import */}
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={isImporting}
        className="h-8 px-3 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/60 hover:text-brand hover:border-brand/30 transition-all flex items-center gap-1.5 disabled:opacity-40"
        title="Import agent config from JSON"
      >
        {isImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
        Import
      </button>

      {/* Success flash */}
      <AnimatePresence>
        {imported && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 text-emerald-400 text-[9px] uppercase tracking-[0.25em]"
          >
            <CheckCircle2 className="w-3 h-3" />
            Merged
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
