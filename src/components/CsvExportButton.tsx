import { useState } from "react";
import { Download, Loader2, Check } from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { useToast } from "../contexts/ToastContext";
import { ShadButton } from "./ui/shadcn/ShadButton";

export type CsvExportType = "calls" | "leads" | "appointments" | "tasks";

/**
 * Streams a CSV from `/api/export/:type.csv` (auth-gated) and triggers
 * a browser download. Uses fetch+Blob so the bearer token is sent —
 * a plain <a href> wouldn't authenticate.
 */
export default function CsvExportButton({
  type,
  label,
  variant = "default",
}: {
  type: CsvExportType;
  label?: string;
  variant?: "default" | "ghost";
}) {
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
      a.download = `wireline-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      console.error("CSV export failed:", err);
      toastError("Export failed", "Could not generate the CSV. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const styles = {
    default:
      "rounded-full text-[11px] uppercase tracking-[0.3em] text-ink/80 hover:text-brand hover:border-brand/40",
    ghost:
      "rounded-full text-[10px] uppercase tracking-[0.3em] text-muted hover:text-brand h-auto px-3 py-1.5",
  };

  return (
    <ShadButton
      type="button"
      disableAnimations
      variant={variant === "ghost" ? "ghost" : "outline"}
      size="sm"
      onClick={onClick}
      disabled={busy}
      className={cn(styles[variant])}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : done ? (
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      ) : (
        <Download className="w-3.5 h-3.5" />
      )}
      {label ?? "Export CSV"}
    </ShadButton>
  );
}
