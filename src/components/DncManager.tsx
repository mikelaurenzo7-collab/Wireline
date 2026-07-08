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
import { authFetch, readApiJson } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDate } from "../lib/safe-date";
import { DNC_IMPORT_MAX_ENTRIES, dncImportLimitError } from "../lib/dnc-import-limits";
import { OPS_SUPPORT_EMPTY, OPS_CHANNEL_TOOLBAR } from "../lib/wireline-ops-design";
import ClientToolbar from "./layout/ClientToolbar";
import { useToast } from "../contexts/ToastContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/shadcn/Dialog";
import { Input } from "./ui/shadcn/Input";
import { Button } from "./atoms";
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
  const { success: toastSuccess, error: toastError, toast } = useToast();
  const [entries, setEntries] = useState<DncEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
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
    setLoadErr(null);
    try {
      const r = await authFetch("/api/dnc");
      const out = await readApiJson<{ entries?: DncEntry[] }>(r);
      if (out.ok === false) throw new Error(out.error);
      setEntries(out.data.entries ?? []);
    } catch (e: unknown) {
      setLoadErr(e instanceof Error ? e.message : "Could not load the DNC list.");
      toastError("Failed to load DNC list", e instanceof Error ? e.message : "Please try again.");
      setEntries([]);
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
      const out = await readApiJson<{ error?: string }>(r);
      if (out.ok === false) throw new Error(out.error);
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
    const removed = entries.find((e) => e.id === id);
    try {
      const r = await authFetch(`/api/dnc/${id}`, { method: "DELETE" });
      const out = await readApiJson<{ error?: string }>(r);
      if (out.ok === false) throw new Error(out.error);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      const phone = removed?.phone_raw || removed?.phone;
      toast({
        type: "success",
        title: "Entry removed",
        message: "Number has been removed from the DNC list.",
        duration: 6000,
        action: phone
          ? {
              label: "Undo",
              onClick: () =>
                void (async () => {
                  try {
                    const res = await authFetch("/api/dnc", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        entries: [
                          {
                            phone,
                            reason: removed?.reason || "opt-out",
                            source: removed?.source || "manual",
                          },
                        ],
                      }),
                    });
                    const undone = await readApiJson<{ error?: string }>(res);
                    if (undone.ok === false) throw new Error(undone.error);
                    toastSuccess("Restored", `${phone} is back on the DNC list.`);
                    await refresh();
                  } catch (err: unknown) {
                    toastError(
                      "Undo failed",
                      err instanceof Error ? err.message : "Re-add the number manually.",
                    );
                  }
                })(),
            }
          : undefined,
      });
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

          const limitErr = dncImportLimitError(rows.length);
          if (limitErr) {
            toastError("Import too large", limitErr);
            return;
          }

          const batch = rows.slice(0, DNC_IMPORT_MAX_ENTRIES);

          const r = await authFetch("/api/dnc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entries: batch }),
          });
          const out = await readApiJson<{ added?: number; error?: string }>(r);
          if (out.ok === false) throw new Error(out.error);
          const added = out.data.added ?? batch.length;
          toastSuccess("CSV imported", `${added} numbers added to DNC list.`);
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
    <div className="flex h-full min-h-0 flex-col gap-3 bg-background text-foreground">
      <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
        <ClientToolbar
          left={
            <span className="app-toolbar-stat">
              {loading
                ? OPS_CHANNEL_TOOLBAR.dnc.loading
                : OPS_CHANNEL_TOOLBAR.dnc.stat(entries.length)}
            </span>
          }
          actions={
            <>
              <Input
                ref={fileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleCsvImport(e.target.files[0])}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={refresh}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                {OPS_CHANNEL_TOOLBAR.dnc.refresh}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                {importing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
                {OPS_CHANNEL_TOOLBAR.dnc.import}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                {OPS_CHANNEL_TOOLBAR.dnc.add}
              </Button>
            </>
          }
        />
        {/* Stat bar */}
        <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total Blocked", value: stats.total, icon: Shield },
            { label: "Manual Entries", value: stats.manual, icon: Plus },
            { label: "CSV Imported", value: stats.csv, icon: FileText },
            { label: "Opt-Out", value: stats.optOut, icon: CheckCircle2 },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="relative overflow-hidden rounded-md border border-border wl-panel p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="wl-label-muted">{label}</p>
                <Icon className="h-3.5 w-3.5 text-brand" />
              </div>
              <p className="font-display text-3xl italic leading-none text-foreground">{value}</p>
            </div>
          ))}
        </div>

        {/* Main list */}
        <div className="min-h-0 flex-1">
          <section className="relative flex h-full min-h-0 flex-col overflow-hidden border border-border wl-paper wl-paper-elevated">
            <header className="relative flex shrink-0 flex-wrap items-center justify-between gap-3 px-3 py-2.5 max-md:px-4 max-md:py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border">
                  <Shield className="h-3.5 w-3.5 text-brand" />
                </div>
                <h3 className="font-display text-base italic leading-tight text-foreground">
                  Blocked Numbers
                </h3>
                <span className="text-eyebrow ml-1 opacity-80">{filtered.length} entries</span>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <Input
                  type="search"
                  aria-label="Search blocked numbers"
                  placeholder="Search numbers…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-44 border border-border bg-transparent pl-8 pr-3 text-[var(--wireline-typography-overline-size)] text-foreground placeholder:text-foreground/55 focus:border-brand/40 focus:outline-none lg:w-64"
                />
              </div>
            </header>
            <div className="h-px shrink-0 wl-panel-divider-fade" />
            <div className="scroll-viewport panel-scroll min-h-0 flex-1 overscroll-contain scroll-pb-6 p-3 max-md:p-4">
              {loading ? (
                <ClientRouteLoading
                  icon={<Shield className="w-6 h-6" />}
                  label={OPS_CHANNEL_TOOLBAR.dnc.loading}
                />
              ) : loadErr ? (
                <EmptyState
                  icon={Shield}
                  title="Couldn't load the suppression list"
                  description={loadErr}
                  actions={[{ label: "Retry", onClick: refresh, primary: true }]}
                  density="compact"
                  withHalo={false}
                  className="py-10"
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={Shield}
                  title={
                    (entries.length === 0 ? OPS_SUPPORT_EMPTY.dnc : OPS_SUPPORT_EMPTY.dncNoMatch)
                      .title
                  }
                  density="compact"
                  withHalo={false}
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
                />
              ) : (
                <div className="divide-y divide-black/5 dark:divide-white/5">
                  {filtered.map((entry) => (
                    <motion.div
                      key={entry.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group flex items-center justify-between gap-3 rounded-md px-2 py-3 transition-all touch-press hover:scale-[1.02] hover:bg-black/[0.02] dark:hover:bg-white/3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-brand/20 bg-brand/10">
                          <Phone className="h-3.5 w-3.5 text-rose-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-mono text-sm text-foreground">
                            {entry.phone_raw || entry.phone}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="wl-micro-meta">{formatDate(entry.created_at)}</span>
                            <span className="h-1 w-1 rounded-full bg-black/15 dark:bg-white/15" />
                            <span className="wl-micro-meta">{reasonLabel(entry.reason)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                        <span
                          className={cn(
                            "wl-label rounded-md border px-2 py-0.5",
                            sourceColor(entry.source),
                          )}
                        >
                          {entry.source}
                        </span>
                        {confirmId === entry.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="wl-micro-meta text-rose-500">Remove?</span>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(entry.id)}
                              disabled={deletingId === entry.id}
                            >
                              {deletingId === entry.id ? (
                                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-2.5 w-2.5" />
                              )}
                              Confirm
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setConfirmId(null)}
                              aria-label="Cancel delete"
                              className="h-8 w-8"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmId(entry.id)}
                            aria-label={`Remove ${entry.phone_raw || entry.phone} from DNC list`}
                            className="h-8 w-8 text-muted hover:text-rose-500"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Add number modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md rounded-md border border-border p-6 shadow-2xl wl-modal-surface">
          <DialogHeader className="flex flex-row items-center gap-3 space-y-0 border-b border-border/60 pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10">
              <Shield className="h-4.5 w-4.5 text-rose-500" />
            </div>
            <div className="text-left">
              <DialogTitle className="font-display text-xl italic leading-none text-foreground">
                Add to DNC
              </DialogTitle>
              <DialogDescription className="wl-label-muted mt-1">
                Do Not Call List
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="mb-2 block wl-label-muted">Phone Number</label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+1 (555) 123-4567"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  className="border-input bg-[var(--wireline-color-surface-recessed)] pl-9 text-sm text-foreground placeholder:text-foreground/55 focus-visible:ring-[var(--wireline-color-focus-default)]"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block wl-label-muted">Reason</label>
              <div className="relative">
                <Select value={addReason} onValueChange={setAddReason}>
                  <SelectTrigger
                    aria-label="Reason"
                    className="h-9 w-full rounded-md border border-input bg-transparent pl-3 text-sm text-foreground"
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

            <div className="flex items-center gap-2.5 rounded-md border border-brand/15 bg-brand/5 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-brand" />
              <p className="wl-micro-meta leading-snug text-brand/80">
                This number will immediately be blocked from all outbound calls and campaigns.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAdd(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleAdd}
              disabled={adding || !addPhone.trim()}
              className="flex-1"
            >
              {adding ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Shield className="h-3.5 w-3.5" />
              )}
              Block Number
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
