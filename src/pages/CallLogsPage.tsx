import { Activity, ShieldAlert } from "lucide-react";

import CallLogsClaude from "../components/CallLogsClaude";
import WorkspaceShell from "../components/WorkspaceShell";

export default function CallLogsPage() {
  return (
    <WorkspaceShell eyebrow="Operate" title="Call Logs" contentClassName="pt-2 pb-0">
      <div className="flex h-full min-h-0 flex-col">
        <section className="mb-4 grid gap-3 px-5 pt-2 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="wl-card-lg">
            <p
              className="wl-eyebrow"
              style={{ color: "var(--wireline-color-action-primary-default)" }}
            >
              Operate the line
            </p>
            <h2 className="mt-3 font-[var(--wireline-font-family-display)] text-[28px] font-normal leading-[1.05] tracking-[-0.025em] text-foreground">
              Live floor, callbacks, and escalations should read cleanly at a glance.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              This page should feel useful even before the call feed gets busy. Review what is
              active, what needs follow-up, and what needs a human handoff without hunting.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="wl-card flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--wireline-color-feedback-success-surface)] text-primary">
                <Activity size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Floor first</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Recent and live calls stay at the top instead of disappearing into a blank ops wall.
                </p>
              </div>
            </div>
            <div className="wl-card flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[color:color-mix(in_srgb,var(--wireline-color-status-warning)_14%,transparent)] text-[var(--wireline-color-status-warning)]">
                <ShieldAlert size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Escalations visible</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Negative sentiment and handoff cases should feel obvious, not buried behind empty rows.
                </p>
              </div>
            </div>
          </div>
        </section>
        <div className="min-h-0 flex-1">
          <CallLogsClaude />
        </div>
      </div>
    </WorkspaceShell>
  );
}
