/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
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
} from "lucide-react";
import Papa from "papaparse";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDate } from "../lib/safe-date";
import { OPS_SUPPORT_EMPTY } from "../lib/wireline-ops-design";
import { BRAND } from "../constants/brand-colors";
import PageShell, { Panel } from "./PageShell";
import { useToast } from "../contexts/ToastContext";
import AdminHubViewport from "./layout/AdminHubViewport";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/shadcn/Dialog";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { EmptyState } from "./ui/EmptyState";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";

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
  if (source === "csv") return "text-brand border-brand/25 bg-brand/10";
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
    <AdminHubViewport>
      <PageShell
        title=""
        eyebrow=""
        subtitle=""
        actions={
          <div className="flex items-center gap-2">
            <ShadButton
              type="button"
              variant="outline"
              size="sm"
              disableAnimations
              onClick={refresh}
              disabled={loading}
              className="h-9 rounded-full text-[10px] uppercase tracking-[0.28em] text-muted"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Refresh
            </ShadButton>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleCsvImport(e.target.files[0])}
            />
            <ShadButton
              type="button"
              variant="outline"
              size="sm"
              disableAnimations
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="h-9 rounded-full text-[10px] uppercase tracking-[0.28em] text-muted"
            >
              {importing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Upload className="w-3 h-3" />
              )}
              Import CSV
            </ShadButton>
            <ShadButton
              type="button"
              variant="destructive"
              size="sm"
              disableAnimations
              onClick={() => setShowAdd(true)}
              className="h-9 rounded-full bg-rose-500/15 border-rose-500/40 text-rose-500 text-[10px] uppercase tracking-[0.28em] hover:bg-rose-500/25 shadow-none"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Number
            </ShadButton>
          </div>
        }
      >
        <div className="flex flex-col flex-1 min-h-0 gap-3 h-full">
          {/* Stat bar */}
          <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Blocked", value: stats.total, icon: Shield },
              { label: "Manual Entries", value: stats.manual, icon: Plus },
              { label: "CSV Imported", value: stats.csv, icon: FileText },
              { label: "Opt-Out", value: stats.optOut, icon: CheckCircle2 },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="relative rounded-md wl-panel border border-border p-4 overflow-hidden"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] uppercase tracking-[0.32em] text-muted">{label}</p>
                  <Icon className="w-3.5 h-3.5 text-brand" />
                </div>
                <p className="font-display italic text-3xl text-ink leading-none">{value}</p>
              </div>
            ))}
          </div>

          {/* Main list */}
          <div className="flex-1 min-h-0">
            <Panel
              title="Blocked Numbers"
              hint={`${filtered.length} entries`}
              icon={Shield}
              scroll
              className="h-full"
              actions={
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <Input
                    type="search"
                    aria-label="Search blocked numbers"
                    placeholder="Search numbers…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 w-44 pl-8 pr-3 rounded-full wl-panel border border-border text-[11px] text-ink placeholder:text-ink/40 focus:border-brand/40 focus:outline-none"
                  />
                </div>
              }
            >
              {loading ? (
                <ClientRouteLoading
                  icon={<Shield className="w-6 h-6" />}
                  label="Loading DNC list…"
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Shield}
                  eyebrow={
                    (entries.length === 0 ? OPS_SUPPORT_EMPTY.dnc : OPS_SUPPORT_EMPTY.dncNoMatch)
                      .eyebrow
                  }
                  title={
                    (entries.length === 0 ? OPS_SUPPORT_EMPTY.dnc : OPS_SUPPORT_EMPTY.dncNoMatch)
                      .title
                  }
                  description={
                    (entries.length === 0 ? OPS_SUPPORT_EMPTY.dnc : OPS_SUPPORT_EMPTY.dncNoMatch)
                      .description
                  }
                  actions={
                    entries.length === 0
                      ? [
                          {
                            label: "Add first number",
                            onClick: () => setShowAdd(true),
                            primary: true,
                          },
                          {
                            label: "Import CSV",
                            onClick: () => fileRef.current?.click(),
                          },
                        ]
                      : []
                  }
                  accent={BRAND.rose}
                />
              ) : (
                <div className="divide-y divide-white/5">
                  {filtered.map((entry) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group flex items-center justify-between py-3 px-2 gap-3 hover:bg-white/3 transition-all rounded-md"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                          <Phone className="w-3.5 h-3.5 text-rose-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-ink">
                            {entry.phone_raw || entry.phone}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[8px] text-ink/40">
                              {formatDate(entry.created_at)}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-white/15" />
                            <span className="text-[8px] text-ink/40">
                              {reasonLabel(entry.reason)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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
                            <ShadButton
                              type="button"
                              variant="destructive"
                              size="sm"
                              disableAnimations
                              onClick={() => handleDelete(entry.id)}
                              disabled={deletingId === entry.id}
                              className="h-7 px-2.5 rounded-full bg-rose-500/20 border-rose-500/40 text-rose-500 text-[9px] uppercase tracking-[0.22em] hover:bg-rose-500/30 shadow-none"
                            >
                              {deletingId === entry.id ? (
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              )}
                              Confirm
                            </ShadButton>
                            <ShadButton
                              type="button"
                              variant="outline"
                              size="icon"
                              disableAnimations
                              onClick={() => setConfirmId(null)}
                              aria-label="Cancel delete"
                              className="h-7 w-7 rounded-full"
                            >
                              <X className="w-3 h-3" />
                            </ShadButton>
                          </div>
                        ) : (
                          <ShadButton
                            type="button"
                            variant="outline"
                            size="icon"
                            disableAnimations
                            onClick={() => setConfirmId(entry.id)}
                            aria-label={`Remove ${entry.phone_raw || entry.phone} from DNC list`}
                            className="h-7 w-7 rounded-full text-muted hover:text-rose-500 hover:border-rose-500/30"
                          >
                            <Trash2 className="w-3 h-3" />
                          </ShadButton>
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
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent className="sm:max-w-md border border-white/10 shadow-2xl p-6 wl-modal-surface rounded-md">
            <DialogHeader className="flex flex-row items-center gap-3 space-y-0 pb-4 border-b border-white/5">
              <div className="w-9 h-9 rounded-md bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                <Shield className="w-4.5 h-4.5 text-rose-500" />
              </div>
              <div className="text-left">
                <DialogTitle className="font-display italic text-xl text-ink leading-none">
                  Add to DNC
                </DialogTitle>
                <DialogDescription className="text-[9px] uppercase tracking-[0.32em] text-muted mt-1">
                  Do Not Call List
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <label className="block text-[9px] uppercase tracking-[0.32em] text-muted mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+1 (555) 123-4567"
                    value={addPhone}
                    onChange={(e) => setAddPhone(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    className="pl-9 bg-black/10 border-white/10 text-sm text-ink placeholder:text-ink/40 focus-visible:ring-rose-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] uppercase tracking-[0.32em] text-muted mb-2">
                  Reason
                </label>
                <div className="relative">
                  <Select value={addReason} onValueChange={setAddReason}>
                    <SelectTrigger
                      aria-label="Reason"
                      className="w-full h-9 pl-3 rounded-md border border-input bg-transparent text-sm text-ink"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REASON_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-3 rounded-md bg-brand/5 border border-brand/15">
                <AlertTriangle className="w-4 h-4 text-brand shrink-0" />
                <p className="text-[10px] text-brand/80 leading-snug">
                  This number will immediately be blocked from all outbound calls and campaigns.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <ShadButton
                variant="outline"
                onClick={() => setShowAdd(false)}
                className="flex-1 rounded-md h-10 border-white/10 hover:bg-white/5 uppercase tracking-[0.2em] text-[10px] font-bold text-muted hover:text-ink"
              >
                Cancel
              </ShadButton>
              <ShadButton
                onClick={handleAdd}
                disabled={adding || !addPhone.trim()}
                className="flex-1 rounded-md h-10 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-500 uppercase tracking-[0.2em] text-[10px] font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {adding ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Shield className="w-3.5 h-3.5" />
                )}
                Block Number
              </ShadButton>
            </div>
          </DialogContent>
        </Dialog>
      </PageShell>
    </AdminHubViewport>
  );
}
