import { useState } from "react";
import { Download, Loader2, Check } from "lucide-react";
import { authFetch } from "../lib/api";
import { clientLog } from "../lib/client-log";
import { useToast } from "../contexts/ToastContext";
import { Button } from "./atoms";

export type CsvExportType = "calls" | "leads" | "appointments" | "tasks";

/**
 * Streams a CSV from `/api/export/:type.csv` (auth-gated) and triggers
 * a browser download. Uses fetch+Blob so the bearer token is sent —
 * a plain <a href> wouldn't authenticate.
 */
export default function CsvExportButton({ type, label }: { type: CsvExportType; label?: string }) {
  const { error: toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onClick = async () => {
    setBusy(true);
    setDone(false);
    try {
      const r = await authFetch(`/api/export/${type}.csv`);
      if (!r.ok) throw new Error(`Export failed (${r.status})`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `botbound-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      clientLog.error("csv-export", err);
      toastError("Export Failed", "Could not generate the CSV. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // The standard secondary button, so it sits level with the controls beside it.
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick} disabled={busy}>
      {busy ? (
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : done ? (
        <Check className="size-3.5 wl-text-success" aria-hidden="true" />
      ) : (
        <Download className="size-3.5" aria-hidden="true" />
      )}
      {label ?? "Export CSV"}
    </Button>
  );
}
