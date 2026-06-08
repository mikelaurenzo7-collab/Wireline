import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";

type CertifiedRow = {
  id: string;
  label: string;
  buyer_tier: "certified" | "beta" | "internal";
  certified: boolean;
};

export default function CertifiedIntegrationsStrip() {
  const [rows, setRows] = useState<CertifiedRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    authFetch("/api/integrations/certified")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled) setRows(body?.integrations ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows.length === 0) return null;

  return (
    <div className="wl-panel border border-border rounded-md p-4 mb-3">
      <p className="app-section-title flex items-center gap-2 mb-3">
        <ShieldCheck className="w-3.5 h-3.5 text-brand" />
        Integration certification
      </p>
      <div className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <span
            key={row.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
              row.certified
                ? "border-brand/25 bg-brand/8 text-ink"
                : row.buyer_tier === "beta"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100"
                  : "border-border text-muted",
            )}
          >
            {row.label}
            <span className="wl-micro-meta uppercase tracking-wider">
              {row.certified ? "Certified" : row.buyer_tier}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
