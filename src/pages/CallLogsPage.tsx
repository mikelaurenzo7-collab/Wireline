import { Activity, ShieldAlert } from "lucide-react";

import CallLogsClaude from "../components/CallLogsClaude";
import WorkspaceShell from "../components/WorkspaceShell";

export default function CallLogsPage() {
  return (
    <WorkspaceShell eyebrow="Run" title="Call Logs" contentClassName="pt-2 pb-0">
      <div className="flex h-full min-h-0 flex-col">
        <section className="mb-4 grid gap-3 px-5 pt-2 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="wl-card-lg">
            <p className="wl-eyebrow wl-eyebrow-primary">Operate the line</p>
            <h2 className="wl-title-tight mt-3">
              Live calls, callbacks, and escalations at a glance.
            </h2>
            <p className="wl-body mt-3 max-w-2xl">
              See what is active, what needs follow-up, and what needs a human handoff without hunting through rows.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <div className="wl-card flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--wireline-color-feedback-success-surface)] text-primary">
                <Activity size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="wl-card-heading">Floor first</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Recent and live calls stay visible from the first load.
                </p>
              </div>
            </div>
            <div className="wl-card flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--wireline-color-feedback-warning-surface)] text-[var(--wireline-color-status-warning)]">
                <ShieldAlert size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="wl-card-heading">Escalations visible</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Handoff cases, sentiment, and follow-ups get a clear place to land.
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
