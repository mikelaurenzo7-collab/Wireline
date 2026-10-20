import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Download, ExternalLink, Loader2, Shield } from "lucide-react";

import DncManager from "./DncManager";
import DncRegistrationCard, { DNC_REGISTRATION_STATE_LABEL } from "./DncRegistrationCard";
import { authFetch } from "../lib/api";
import type { DncSellerRegistrationState } from "../lib/dnc-seller-registration-rules";
import type { ConsentLedgerEvent } from "../lib/tcpa-consent";
import { Button, Skeleton } from "./atoms";
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

const CONSENT_EVENT_LABELS: Record<ConsentLedgerEvent, string> = {
  disclosure_played: "Recording Disclosure Played",
  disclosure_not_detected: "Recording Disclosure Not Detected",
  disclosure_unverifiable: "Recording Disclosure Unverifiable",
  ai_disclosure_played: "AI Disclosure Played",
  ai_disclosure_not_detected: "AI Disclosure Not Detected",
  ai_disclosure_unverifiable: "AI Disclosure Unverifiable",
  consent_granted: "Consent Granted",
  consent_revoked: "Consent Revoked",
  opt_out_requested: "Opt-Out Requested",
  recording_started: "Recording Started",
  recording_stopped: "Recording Stopped",
};

function consentEventLabel(event: string): string {
  const key = event.trim().toLowerCase();
  if (Object.hasOwn(CONSENT_EVENT_LABELS, key)) {
    return CONSENT_EVENT_LABELS[key as ConsentLedgerEvent];
  }
  return (
    key
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((word) =>
        ["ai", "sms", "tcpa", "dnc", "api"].includes(word)
          ? word.toUpperCase()
          : word.charAt(0).toUpperCase() + word.slice(1),
      )
      .join(" ") || "Consent Event"
  );
}

export default function ComplianceCenter() {
  const [summary, setSummary] = useState<ComplianceCenterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registryState, setRegistryState] = useState<DncSellerRegistrationState | null>(null);

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
        `botbound-account-export-${Date.now()}.json`;
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
          <h2 className="text-base font-semibold text-foreground">Call Compliance</h2>
          <Shield className="size-5 shrink-0 text-primary" aria-hidden="true" />
        </div>

        {loading ? (
          <div
            className="mt-4 grid gap-3 sm:grid-cols-3"
            aria-busy="true"
            aria-label="Loading compliance status"
          >
            <Skeleton shape="surface" className="h-[72px] w-full" />
            <Skeleton shape="surface" className="h-[72px] w-full" />
            <Skeleton shape="surface" className="h-[72px] w-full" />
          </div>
        ) : error ? (
          <StatusNotice tone="destructive" className="mt-3" title={error} />
        ) : summary ? (
          <div className="mt-4 space-y-3">
            <dl className="grid gap-3 border-y border-border py-4 sm:grid-cols-3 sm:gap-4">
              <div className="flex items-baseline justify-between gap-4 sm:block">
                <dt className="shrink-0 text-xs font-medium text-muted-foreground">
                  Do Not Call Registry
                </dt>
                <dd className="text-right text-sm font-medium text-foreground sm:mt-1 sm:text-left">
                  {registryState ? DNC_REGISTRATION_STATE_LABEL[registryState] : "Checking"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 sm:block">
                <dt className="shrink-0 text-xs font-medium text-muted-foreground">Federal DNC</dt>
                <dd className="text-right text-sm font-medium text-foreground sm:mt-1 sm:text-left">
                  {summary.federal_dnc_configured
                    ? "Platform screening is configured"
                    : "Platform screening is not configured"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 sm:block">
                <dt className="shrink-0 text-xs font-medium text-muted-foreground">
                  Workspace DNC
                </dt>
                <dd className="text-right text-sm font-medium text-foreground sm:mt-1 sm:text-left">
                  {summary.dnc_entry_count ?? 0} blocked{" "}
                  {summary.dnc_entry_count === 1 ? "number" : "numbers"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 sm:block">
                <dt className="shrink-0 text-xs font-medium text-muted-foreground">
                  Consent Events
                </dt>
                <dd className="text-right text-sm font-medium text-foreground sm:mt-1 sm:text-left">
                  {summary.consent_event_count ?? 0} recorded
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" asChild>
            <Link to="/trust" target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              Trust Pack
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
            Audit Export
          </Button>
        </div>
      </section>

      <div className="grid gap-4">
        <details>
          <summary className="wl-paper wl-paper-elevated wl-focus-ring-halo min-h-11 cursor-pointer p-4 text-sm font-semibold text-foreground">
            DNC registration
            <span className="mt-1 block text-xs font-normal text-muted-foreground">
              Business outbound is coming soon.
            </span>
          </summary>
          <div className="mt-3">
            <DncRegistrationCard onStateChange={setRegistryState} />
          </div>
        </details>

        {summary ? (
          <section className="wl-paper wl-paper-elevated p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Consent Ledger</h3>
              </div>
              {recentEvents.length > 0 ? (
                <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  {recentEvents.length} shown
                </span>
              ) : null}
            </div>
            <div className="mt-3 grid max-h-[360px] gap-2 overflow-y-auto pr-1">
              {recentEvents.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-3.5 text-sm leading-6 text-muted-foreground">
                  <p>No consent events yet.</p>
                  <p className="mt-1">
                    <Link
                      to="/phone?tab=setup"
                      className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                    >
                      Review Phone Setup
                    </Link>
                  </p>
                </div>
              ) : (
                recentEvents.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-border px-3 py-2 text-sm text-foreground"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium" title={entry.event}>
                        {consentEventLabel(entry.event)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {entry.created_at ? new Date(entry.created_at).toLocaleString() : ""}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {entry.customer_number || "Unknown number"}
                      {entry.state ? ` · ${entry.state}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        <section className="wl-paper wl-paper-elevated p-4">
          <DncManager />
        </section>
      </div>
    </div>
  );
}
