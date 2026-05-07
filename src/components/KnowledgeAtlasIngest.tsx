import { useState, useRef } from "react";
import {
  Globe, FileText, Upload, ChevronRight, Loader2, Check, AlertTriangle,
  Trash2, X, Plus, Terminal, Search
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Papa from "papaparse";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { ClaudeRecipeButton } from "./ClaudeRecipes";

interface KnowledgeAtlasIngestProps {
  agents: Array<{ id: string; name: string }>;
  onRefresh: () => void;
}

export default function KnowledgeAtlasIngest({ agents, onRefresh }: KnowledgeAtlasIngestProps) {
  const [activeMode, setActiveMode] = useState<"url" | "document" | "bulk">("url");
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ success: number; failed: number } | null>(null);
  const [bulkAgentId, setBulkAgentId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !bulkAgentId) return;

    setIsImporting(true);
    setImportStatus(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let success = 0;
        let failed = 0;

        // Process in small batches to avoid rate limits
        const data = results.data as any[];
        for (const row of data) {
          const content = row.content || row.fact || row.Knowledge || Object.values(row)[0];
          if (!content) {
            failed++;
            continue;
          }

          try {
            const res = await authFetch("/api/knowledge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ agent_id: bulkAgentId, content: String(content) })
            });
            if (res.ok) success++;
            else failed++;
          } catch {
            failed++;
          }
        }

        setImportStatus({ success, failed });
        setIsImporting(false);
        onRefresh();
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  };

  return (
    <div className="rounded-2xl glass border border-white/10 overflow-hidden">
      <div className="flex border-b border-white/10 bg-black/20">
        {[
          { id: "url", label: "Web Crawl", icon: Globe },
          { id: "document", label: "PDF Ingest", icon: FileText },
          { id: "bulk", label: "CSV Bulk", icon: Upload },
        ].map((mode) => (
          <button
            key={mode.id}
            onClick={() => setActiveMode(mode.id as any)}
            className={cn(
              "flex-1 py-3 px-4 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] transition-all",
              activeMode === mode.id
                ? "bg-brand/10 text-brand font-semibold shadow-[inset_0_-2px_0_0_#0AC8D4]"
                : "text-muted hover:text-ink hover:bg-white/5"
            )}
          >
            <mode.icon className="w-3.5 h-3.5" />
            {mode.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        <AnimatePresence mode="wait">
          {activeMode === "url" && (
            <motion.div
              key="url"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-ink mb-1">Crawl Website</h4>
                  <p className="text-xs text-muted/70 leading-relaxed">
                    Wireline AI will visit your site, follow links, and extract every fact your agents need.
                  </p>
                </div>
                <ClaudeRecipeButton
                  recipe="knowledge-from-url"
                  label="Start Crawl"
                  className="shrink-0"
                />
              </div>
            </motion.div>
          )}

          {activeMode === "document" && (
            <motion.div
              key="document"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-ink mb-1">Analyze PDF</h4>
                  <p className="text-xs text-muted/70 leading-relaxed">
                    Upload brochures, manuals, or menus. Claude reads them natively and seeds your knowledge base.
                  </p>
                </div>
                <ClaudeRecipeButton
                  recipe="knowledge-from-document"
                  label="Upload PDF"
                  className="shrink-0"
                />
              </div>
            </motion.div>
          )}

          {activeMode === "bulk" && (
            <motion.div
              key="bulk"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Target Agent</label>
                  <select
                    value={bulkAgentId}
                    onChange={(e) => setBulkAgentId(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 outline-none text-ink text-sm focus:border-brand/60"
                  >
                    <option value="">Select Agent...</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">CSV File</label>
                  <input
                    type="file"
                    accept=".csv"
                    ref={fileInputRef}
                    disabled={!bulkAgentId || isImporting}
                    onChange={handleBulkImport}
                    className="w-full text-xs text-muted file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:uppercase file:tracking-widest file:font-semibold file:bg-brand/20 file:text-brand hover:file:bg-brand/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {isImporting && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-brand/5 border border-brand/20">
                  <Loader2 className="w-4 h-4 animate-spin text-brand" />
                  <span className="text-xs text-brand uppercase tracking-wider">Importing data...</span>
                </div>
              )}

              {importStatus && (
                <div className={cn(
                  "flex items-center justify-between px-4 py-3 rounded-xl border",
                  importStatus.failed === 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-amber-500/5 border-amber-500/20"
                )}>
                  <div className="flex items-center gap-2">
                    {importStatus.failed === 0 ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
                    <span className="text-xs text-ink/80">
                      Import complete: <strong className="text-emerald-400">{importStatus.success}</strong> success,
                      <strong className={importStatus.failed > 0 ? "text-rose-400" : "text-ink/40"}> {importStatus.failed}</strong> failed.
                    </span>
                  </div>
                  <button onClick={() => setImportStatus(null)}><X className="w-3.5 h-3.5 text-muted" /></button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
