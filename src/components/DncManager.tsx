/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield,
  Plus,
  Trash2,
  Upload,
  Search,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FileText,
  X,
  Phone,
  ChevronDown,
} from "lucide-react";
import Papa from "papaparse";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDate } from "../lib/safe-date";
import PageShell, { Panel } from "./PageShell";
import { useToast } from "../contexts/ToastContext";
import SettingsTabSwitcher from "./admin/SettingsTabSwitcher";

interface DncEntry {
  id: string;
  phone: string;
  phone_raw: string | null;
  reason: string | null;
  source: string;
  created_at: string;
}

const REASON_OPTIONS = [
  { value: "opt-out", label: "Customer Opt-Out" },
  { value: "legal", label: "Legal / Regulatory" },
  { value: "litigator", label: "Known Litigator" },
  { value: "federal", label: "National DNC Registry" },
  { value: "custom", label: "Custom / Other" },
];

function reasonLabel(r: string | null) {
  if (!r) return "Manual";
  return REASON_OPTIONS.find((o) => o.value === r)?.label ?? r;
}

function sourceColor(source: string) {
  if (source === "csv") return "text-violet-600 border-violet-500/25 bg-violet-500/10";
  if (source === "opt-out") return "text-rose-500 border-rose-500/25 bg-rose-500/10";
  return "text-brand border-brand/25 bg-brand/10";
}

export default function DncManager() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [entries, setEntries] = useState<DncEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Add-single form
  const [showAdd, setShowAdd] = useState(false);
  const [addPhone, setAddPhone] = useState("");
  const [addReason, setAddReason] = useState("opt-out");
  const [adding, setAdding] = useState(false);

  // CSV import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await authFetch("/api/dnc");
      const d = await r.json();
      setEntries(d.entries || []);
    } catch {
      toastError("Failed to load DNC list", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time fetch on mount
  }, []);

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    return !q || (e.phone_raw || e.phone).includes(q) || (e.reason || "").toLowerCase().includes(q);
  });

  const handleAdd = async () => {
    if (!addPhone.trim()) return;
    setAdding(true);
    try {
      const r = await authFetch("/api/dnc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [{ phone: addPhone.trim(), reason: addReason, source: "manual" }],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      toastSuccess("Number added to DNC list", `${addPhone.trim()} will no longer be dialed.`);
      setAddPhone("");
      setAddReason("opt-out");
      setShowAdd(false);
      await refresh();
    } catch (e: any) {
      toastError("Failed to add number", e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const r = await authFetch(`/api/dnc/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to remove entry.");
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toastSuccess("Entry removed", "Number has been removed from the DNC list.");
    } catch (e: any) {
      toastError("Delete failed", e.message);
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const handleCsvImport = (file: File) => {
    setImporting(true);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          // Accept columns: phone / number / Phone / Number / phone_number
          const rows = results.data
            .map((row: Record<string, string>) => {
              const phone =
                row.phone || row.number || row.Phone || row.Number || row.phone_number || "";
              const reason = row.reason || row.Reason || "csv";
              return { phone: phone.trim(), reason, source: "csv" };
            })
            .filter((r: { phone: string }) => r.phone && /\d/.test(r.phone));

          if (rows.length === 0) {
            toastError(
              "No valid numbers found",
              "Ensure your CSV has a 'phone' or 'number' column.",
            );
            return;
          }

          const r = await authFetch("/api/dnc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entries: rows }),
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || "Import failed");
          toastSuccess("CSV imported", `${d.added ?? rows.length} numbers added to DNC list.`);
          await refresh();
        } catch (e: any) {
          toastError("Import failed", e.message);
        } finally {
          setImporting(false);
          if (fileRef.current) fileRef.current.value = "";
        }
      },
      error: () => {
        toastError("CSV parse error", "Could not read the file.");
        setImporting(false);
      },
    });
  };

  const stats = {
    total: entries.length,
    manual: entries.filter((e) => e.source === "manual").length,
    csv: entries.filter((e) => e.source === "csv" || e.source === "import").length,
    optOut: entries.filter(
      (e) =>
        e.source === "opt-out" ||
        e.source === "sms_opt_out" ||
        e.source === "email_opt_out" ||
        e.reason === "opt-out",
    ).length,
  };

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <SettingsTabSwitcher />
      <PageShell
        eyebrow="Compliance · Outbound Protection"
        title="DNC List"
        subtitle="Numbers on this list will never be dialed — by any agent or campaign. TCPA-safe outbound operations."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="h-9 px-3 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Refresh
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleCsvImport(e.target.files[0])}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="h-9 px-4 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {importing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              Import CSV
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="h-9 px-4 rounded-full flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] transition-all bg-rose-500/15 border border-rose-500/40 text-rose-500 hover:bg-rose-500/25"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Number
            </button>
          </div>
        }
      >
        <div className="h-full grid grid-cols-12 gap-3">
          {/* Stat bar */}
          <div className="col-span-12 grid grid-cols-2 sm:grid-cols-4 gap-3 h-fit">
            {[
              { label: "Total Blocked", value: stats.total, accent: "#0A0A0A", icon: Shield },
              { label: "Manual Entries", value: stats.manual, accent: "#0A0A0A", icon: Plus },
              { label: "CSV Imported", value: stats.csv, accent: "#0A0A0A", icon: FileText },
              { label: "Opt-Out", value: stats.optOut, accent: "#10B981", icon: CheckCircle2 },
            ].map(({ label, value, accent, icon: Icon }) => (
              <div
                key={label}
                className="relative rounded-xl glass border border-white/10 p-4 overflow-hidden"
              >
                <div
                  className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-25 blur-3xl pointer-events-none"
                  style={{ background: `radial-gradient(circle,${accent},transparent)` }}
                />
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] uppercase tracking-[0.32em] text-muted">{label}</p>
                  <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
                </div>
                <p className="font-display italic text-3xl text-ink leading-none">{value}</p>
              </div>
            ))}
          </div>

          {/* Main list */}
          <div className="col-span-12 min-h-0" style={{ height: "calc(100% - 120px)" }}>
            <Panel
              title="Blocked Numbers"
              hint={`${filtered.length} entries`}
              icon={Shield}
              scroll
              actions={
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input
                    type="search"
                    aria-label="Search blocked numbers"
                    placeholder="Search numbers…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-44 pl-8 pr-3 rounded-full glass border border-white/10 text-[11px] text-ink placeholder:text-muted/60 focus:border-brand/40 focus:outline-none transition-all"
                  />
                </div>
              }
            >
              {loading ? (
                <div className="h-full flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-brand" />
                  <p className="text-eyebrow">Loading DNC list…</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg,rgba(0, 0, 0 ,0.15),rgba(0, 0, 0 ,0.15))",
                    }}
                  >
                    <Shield className="w-7 h-7 text-rose-500" />
                  </div>
                  <div>
                    <p className="font-display italic text-2xl text-ink mb-1">
                      {entries.length === 0 ? "No numbers blocked" : "No matches"}
                    </p>
                    <p className="text-xs text-muted/70 max-w-xs leading-relaxed">
                      {entries.length === 0
                        ? "Add numbers manually or import a CSV to prevent them from being dialed by any agent."
                        : "Try a different search."}
                    </p>
                  </div>
                  {entries.length === 0 && (
                    <button
                      onClick={() => setShowAdd(true)}
                      className="h-9 px-5 rounded-full flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] bg-rose-500/15 border border-rose-500/40 text-rose-500 hover:bg-rose-500/25 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add First Number
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filtered.map((entry) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group flex items-center justify-between py-3 px-2 gap-3 hover:bg-white/3 transition-all rounded-lg"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{
                            background: "rgba(0, 0, 0 ,0.10)",
                            border: "1px solid rgba(0, 0, 0 ,0.20)",
                          }}
                        >
                          <Phone className="w-3.5 h-3.5 text-rose-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-ink">
                            {entry.phone_raw || entry.phone}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[8px] text-muted/60">
                              {formatDate(entry.created_at)}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-white/15" />
                            <span className="text-[8px] text-muted/60">
                              {reasonLabel(entry.reason)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span
                          className={cn(
                            "text-[8px] uppercase tracking-[0.22em] px-2 py-0.5 rounded-full border",
                            sourceColor(entry.source),
                          )}
                        >
                          {entry.source}
                        </span>
                        {confirmId === entry.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-rose-500">Remove?</span>
                            <button
                              onClick={() => handleDelete(entry.id)}
                              disabled={deletingId === entry.id}
                              className="disabled:opacity-50 disabled:cursor-not-allowed h-7 px-2.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-500 text-[9px] uppercase tracking-[0.22em] hover:bg-rose-500/30 transition-all flex items-center gap-1"
                            >
                              {deletingId === entry.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              )}
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              aria-label="Cancel delete"
                              className="h-7 w-7 rounded-full glass border border-white/10 text-muted hover:text-ink transition-all flex items-center justify-center"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(entry.id)}
                            aria-label={`Remove ${entry.phone_raw || entry.phone} from DNC list`}
                            className="h-7 w-7 rounded-full glass border border-white/10 text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>

        {/* Add number modal */}
        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-md glass-strong rounded-2xl border border-white/12 shadow-2xl p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl glass border border-rose-500/30 flex items-center justify-center">
                      <Shield className="w-4.5 h-4.5 text-rose-500" />
                    </div>
                    <div>
                      <h2 className="font-display italic text-xl text-ink leading-none">
                        Add to DNC
                      </h2>
                      <p className="text-[9px] uppercase tracking-[0.32em] text-muted mt-1">
                        Do Not Call List
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAdd(false)}
                    className="w-8 h-8 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-ink transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[9px] uppercase tracking-[0.32em] text-muted mb-2">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="+1 (555) 123-4567"
                        value={addPhone}
                        onChange={(e) => setAddPhone(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                        className="w-full h-10 pl-9 pr-4 rounded-xl glass border border-white/10 text-sm text-ink placeholder:text-muted/65 focus:border-rose-400/50 focus:outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] uppercase tracking-[0.32em] text-muted mb-2">
                      Reason
                    </label>
                    <div className="relative">
                      <select
                        aria-label="Reason"
                        value={addReason}
                        onChange={(e) => setAddReason(e.target.value)}
                        className="w-full h-10 pl-3 pr-10 rounded-xl glass border border-white/10 text-sm text-ink focus:border-rose-400/50 focus:outline-none transition-all appearance-none cursor-pointer"
                      >
                        {REASON_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <p className="text-[10px] text-amber-600/80 leading-snug">
                      This number will immediately be blocked from all outbound calls and campaigns.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-6">
                  <button
                    onClick={() => setShowAdd(false)}
                    className="flex-1 h-10 rounded-xl glass border border-white/10 text-[11px] uppercase tracking-[0.28em] text-muted hover:text-ink transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdd}
                    disabled={adding || !addPhone.trim()}
                    className="flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.28em] bg-rose-500/20 border border-rose-500/40 text-rose-500 hover:bg-rose-500/30 transition-all disabled:opacity-50"
                  >
                    {adding ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Shield className="w-3.5 h-3.5" />
                    )}
                    Block Number
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </PageShell>
    </div>
  );
}
