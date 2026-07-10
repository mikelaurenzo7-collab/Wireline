import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, ExternalLink, Loader2, Shield } from "lucide-react";

import DncManager from "./DncManager";
import { authFetch } from "../lib/api";
import { Button } from "./atoms";
import { StatusNotice } from "./molecules";

type ComplianceCenterSummary = {
  federal_dnc_configured: boolean;
  dnc_entry_count: number;
  consent_event_count: number;
  consent_rule_version: string;
  recent_consent_events: Array<{
    id: string;
    event: string;
    customer_number?: string | null;
    call_id?: string | null;
    state?: string | null;
    created_at?: string;
  }>;
  audit_export_path: string;
  trust_pack_path: string;
};

export default function ComplianceCenter() {
  const [summary, setSummary] = useState<ComplianceCenterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/compliance/center");
      if (!response.ok) throw new Error("Failed to load compliance center");
      setSummary(await response.json());
    } catch {
      setError("Could not load compliance center.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function downloadAuditExport() {
    setExporting(true);
    setError(null);
    try {
      const response = await authFetch("/api/account/export", { method: "POST" });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const filename =
        disposition?.match(/filename="([^"]+)"/)?.[1] ||
        `wireline-account-export-${Date.now()}.json`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not download audit export.");
    } finally {
      setExporting(false);
    }
  }

  const recentEvents = summary?.recent_consent_events || [];

  return (
    <div className="grid gap-4">
      <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="wl-eyebrow wl-eyebrow--muted">Compliance Center</p>
            <h2 className="mt-1 text-base font-semibold text-foreground">
              Prove what happened on every call
            </h2>
            <p className="mt-1.5 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
              Wireline helps you prove who was called, why they were callable, what was disclosed,
              and what action was taken.
            </p>
          </div>
          <Shield className="size-5 shrink-0 text-primary" aria-hidden="true" />
        </div>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading compliance status…
          </div>
        ) : error ? (
          <StatusNotice tone="destructive" className="mt-3" title={error} />
        ) : summary ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Federal DNC
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {summary.federal_dnc_configured ? "Vendor configured" : "Not configured"}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tenant DNC
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {summary.dnc_entry_count} suppressed numbers
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Consent events
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {summary.consent_event_count} logged
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" asChild>
            <Link to="/trust" target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              Trust pack
            </Link>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={exporting}
            onClick={() => void downloadAuditExport()}
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Audit export
          </Button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,.9fr)]">
        <section className="wl-paper wl-paper-elevated p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Consent ledger</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Recent disclosure and consent events (rule version {summary?.consent_rule_version || "—"}).
              </p>
            </div>
            <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {recentEvents.length} shown
            </span>
          </div>
          <div className="mt-3 grid max-h-[360px] gap-2 overflow-y-auto pr-1">
            {recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No consent events logged yet.</p>
            ) : (
              recentEvents.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{entry.event}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {entry.customer_number || "Unknown number"}
                    {entry.state ? ` · ${entry.state}` : ""}
                    {entry.call_id ? ` · call ${entry.call_id}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="wl-paper wl-paper-elevated p-4">
          <DncManager />
        </section>
      </div>
    </div>
  );
}
