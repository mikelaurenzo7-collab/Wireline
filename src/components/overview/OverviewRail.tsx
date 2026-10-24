import { ArrowRight, Bot, Plus, ShieldCheck, Workflow } from "lucide-react";
import { Link } from "react-router";

import type { WorkspaceAgentSummary } from "../../contexts/AgentsContext";
import { agentReadinessLabel } from "../../lib/agent-readiness";
import { formatAgentRoleLabel } from "../../lib/product-copy";
import BotMark from "../BotMark";
import { Button } from "../atoms";

export function BotRoster({
  bots,
  phoneLookupDegraded,
}: {
  bots: WorkspaceAgentSummary[];
  phoneLookupDegraded: boolean;
}) {
  return (
    <section className="wl-paper wl-paper-elevated p-5" aria-labelledby="overview-bots-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Workspace
          </p>
          <h2 id="overview-bots-title" className="mt-1 text-base font-semibold text-foreground">
            Bots
          </h2>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] font-semibold text-muted-foreground">
          {bots.length}
        </span>
      </div>

      <div className="mt-4 grid gap-2">
        {bots.slice(0, 4).map((bot) => {
          const readiness = agentReadinessLabel(bot, phoneLookupDegraded);
          const live = Boolean(bot.phone_number);
          return (
            <Link
              key={bot.id}
              to={`/studio?agent=${encodeURIComponent(bot.id)}&section=setup`}
              className="group flex min-h-[56px] min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/30 hover:bg-muted/30 wl-focus-ring-halo"
            >
              <BotMark
                seed={bot.id}
                name={bot.name}
                markKey={bot.mark_key}
                size={24}
                title={`${bot.name} mark`}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {bot.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {formatAgentRoleLabel(bot.role)}
                </span>
              </span>
              <span className={`wl-chip wl-chip--${live ? "success" : "warning"} shrink-0`}>
                <span className="wl-chip__dot" aria-hidden="true" />
                {readiness}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button asChild variant="secondary" size="sm" className="justify-center">
          <Link to="/studio">All Bots</Link>
        </Button>
        <Button asChild size="sm" className="justify-center">
          <Link to="/studio?create=1">
            <Plus size={14} aria-hidden="true" />
            New Bot
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function ConfigureCard({ bot }: { bot?: WorkspaceAgentSummary }) {
  const setupHref = bot
    ? `/studio?agent=${encodeURIComponent(bot.id)}&section=setup`
    : "/studio?create=1";
  const links = [
    {
      label: "Role & Voice",
      detail: "Role, behavior, tone, and voice",
      href: setupHref,
      icon: Bot,
    },
    {
      label: "Channels & Tools",
      detail: "Email, calendars, and optional tools",
      href: "/connections",
      icon: Workflow,
    },
    {
      label: "Knowledge",
      detail: "Facts, files, policies, and preferences",
      href: "/knowledge",
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="wl-paper wl-paper-elevated p-5" aria-labelledby="overview-config-title">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        Configure
      </p>
      <h2 id="overview-config-title" className="mt-1 text-base font-semibold text-foreground">
        One Control Surface
      </h2>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        Every Bot uses the same building blocks. Start from a role, then shape the workflow.
      </p>
      <div className="mt-4 grid gap-1">
        {links.map(({ label, detail, href, icon: Icon }) => (
          <Link
            key={label}
            to={href}
            className="group flex min-h-[54px] items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted/50 wl-focus-ring-halo"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon size={15} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-foreground">{label}</span>
              <span className="block truncate text-xs text-muted-foreground">{detail}</span>
            </span>
            <ArrowRight
              size={14}
              className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </section>
  );
}
