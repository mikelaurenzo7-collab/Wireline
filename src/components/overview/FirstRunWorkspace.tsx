import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { Link } from "react-router";

import { Button } from "../atoms";

export default function FirstRunWorkspace() {
  const roleStarters = [
    "Receptionist",
    "Sales Associate",
    "Support Specialist",
    "Scheduler",
    "Personal Assistant",
  ];

  return (
    <section className="wl-paper wl-paper-elevated overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)]">
        <div className="relative overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              <Sparkles size={13} aria-hidden="true" />
              One Workspace
            </span>
            <h1 className="mt-5 max-w-[15ch] font-[var(--wireline-font-family-display)] text-[clamp(2rem,5vw,4rem)] font-semibold leading-[0.94] tracking-[-0.045em] text-foreground">
              Build Your Bot
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Start with a proven role or create your own. Configure voice, text, email,
              knowledge, tools, guardrails, approvals, and handoffs without choosing a
              personal or business workspace.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="justify-center sm:min-w-[170px]">
                <Link to="/studio?create=1">
                  <Plus size={15} aria-hidden="true" />
                  Create Your Own
                </Link>
              </Button>
              <Button asChild variant="secondary" className="justify-center sm:min-w-[170px]">
                <Link to="/templates">
                  Browse Templates
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-2" aria-label="Example Bot roles">
              {roleStarters.map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  {role}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border bg-muted/25 p-5 sm:p-7 lg:border-l lg:border-t-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Configure Once
          </p>
          <ol className="mt-4 grid gap-3">
            {[
              [
                "1",
                "Choose the Job",
                "Pick a business role, a personal starter, or a blank canvas.",
              ],
              [
                "2",
                "Connect the Channels",
                "Use voice, text, and email together or only where the workflow needs them.",
              ],
              [
                "3",
                "Launch with Control",
                "Set knowledge, tools, approvals, consent rules, handoffs, and stopping conditions.",
              ],
            ].map(([number, title, detail]) => (
              <li key={number} className="flex gap-3 rounded-xl border border-border bg-card p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 font-mono text-xs font-semibold text-primary">
                  {number}
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm font-semibold text-foreground">{title}</strong>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
