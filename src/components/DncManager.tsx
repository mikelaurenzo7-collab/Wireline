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
import { OPS_SUPPORT_EMPTY, OPS_CHANNEL_TOOLBAR, WL_OPS_CLASSES } from "../lib/wireline-ops-design";
import ClientToolbar from "./layout/ClientToolbar";
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
    <AdminHubViewport scroll>
      <div className="bg-background text-foreground paper-texture h-full">
        <PageShell title="" eyebrow="" subtitle="" scrollable>
          <div className="flex flex-col flex-1 min-h-0 gap-3 h-full">
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
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={refresh}
                    disabled={loading}
                    className={cn(
                      "h-9 rounded-full text-muted touch-press hover:scale-[1.05]",
                      WL_OPS_CLASSES.filterChip,
                    )}
                  >
                    {loading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    {OPS_CHANNEL_TOOLBAR.dnc.refresh}
                  </ShadButton>
                  <ShadButton
                    type="button"
                    variant="outline"
                    size="sm"
                    disableAnimations
                    onClick={() => fileRef.current?.click()}
                    disabled={importing}
                    className={cn(
                      "h-9 rounded-full text-muted touch-press hover:scale-[1.05]",
                      WL_OPS_CLASSES.filterChip,
                    )}
                  >
                    {importing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Upload className="w-3 h-3" />
                    )}
                    {OPS_CHANNEL_TOOLBAR.dnc.import}
                  </ShadButton>
                  <ShadButton
                    type="button"
                    variant="destructive"
                    size="sm"
                    disableAnimations
                    onClick={() => setShowAdd(true)}
                    className="h-9 rounded-full bg-rose-500/15 border-rose-500/40 text-rose-500 wl-label hover:bg-rose-500/25 shadow-none touch-press hover:scale-[1.05]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {OPS_CHANNEL_TOOLBAR.dnc.add}
                  </ShadButton>
                </>
              }
            />
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
                    <p className="wl-label-muted">{label}</p>
                    <Icon className="w-3.5 h-3.5 text-brand" />
                  </div>
                  <p className="font-display italic text-3xl text-foreground leading-none">
                    {value}
                  </p>
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
                      className="h-8 w-44 lg:w-64 pl-8 pr-3 rounded-full wl-panel border border-border text-[var(--wireline-typography-overline-size)] text-foreground placeholder:text-foreground/55 focus:border-brand/40 focus:outline-none"
                    />
                  </div>
                }
              >
                {loading ? (
                  <ClientRouteLoading
                    icon={<Shield className="w-6 h-6" />}
                    label={OPS_CHANNEL_TOOLBAR.dnc.loading}
                  />
                ) : loadErr ? (
                  <EmptyState
                    icon={Shield}
                    eyebrow="DNC list unavailable"
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
                        className="group flex items-center justify-between py-3 px-2 gap-3 hover:bg-black/[0.02] dark:hover:bg-white/3 transition-all rounded-md touch-press hover:scale-[1.02]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
                            <Phone className="w-3.5 h-3.5 text-rose-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-mono text-sm text-foreground">
                              {entry.phone_raw || entry.phone}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="wl-micro-meta">{formatDate(entry.created_at)}</span>
                              <span className="w-1 h-1 rounded-full bg-black/15 dark:bg-white/15" />
                              <span className="wl-micro-meta">{reasonLabel(entry.reason)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                          <span
                            className={cn(
                              "wl-label px-2 py-0.5 rounded-full border",
                              sourceColor(entry.source),
                            )}
                          >
                            {entry.source}
                          </span>
                          {confirmId === entry.id ? (
                            <div className="flex items-center gap-1.5">
                              <span className="wl-micro-meta text-rose-500">Remove?</span>
                              <ShadButton
                                type="button"
                                variant="destructive"
                                size="sm"
                                disableAnimations
                                onClick={() => handleDelete(entry.id)}
                                disabled={deletingId === entry.id}
                                className="h-7 px-2.5 rounded-full bg-rose-500/20 border-rose-500/40 text-rose-500 wl-label hover:bg-rose-500/30 shadow-none"
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
            <DialogContent className="sm:max-w-md border border-border shadow-2xl p-6 wl-modal-surface rounded-md">
              <DialogHeader className="flex flex-row items-center gap-3 space-y-0 pb-4 border-b border-border/60">
                <div className="w-9 h-9 rounded-md bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
                  <Shield className="w-4.5 h-4.5 text-rose-500" />
                </div>
                <div className="text-left">
                  <DialogTitle className="font-display italic text-xl text-foreground leading-none">
                    Add to DNC
                  </DialogTitle>
                  <DialogDescription className="wl-label-muted mt-1">
                    Do Not Call List
                  </DialogDescription>
                </div>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div>
                  <label className="block wl-label-muted mb-2">Phone Number</label>
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
                      className="pl-9 bg-[var(--wireline-color-surface-recessed)] border-input text-sm text-foreground placeholder:text-foreground/55 focus-visible:ring-[var(--wireline-color-focus-default)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block wl-label-muted mb-2">Reason</label>
                  <div className="relative">
                    <Select value={addReason} onValueChange={setAddReason}>
                      <SelectTrigger
                        aria-label="Reason"
                        className="w-full h-9 pl-3 rounded-md border border-input bg-transparent text-sm text-foreground"
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
                  <p className="wl-micro-meta text-brand/80 leading-snug">
                    This number will immediately be blocked from all outbound calls and campaigns.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <ShadButton
                  variant="outline"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 rounded-md h-10 border-border hover:bg-accent/40 uppercase tracking-[0.2em] wl-label font-bold text-muted hover:text-foreground"
                >
                  Cancel
                </ShadButton>
                <ShadButton
                  onClick={handleAdd}
                  disabled={adding || !addPhone.trim()}
                  className="flex-1 rounded-md h-10 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-500 uppercase tracking-[0.2em] wl-label font-bold flex items-center justify-center gap-2 disabled:opacity-50"
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
      </div>
    </AdminHubViewport>
  );
}
