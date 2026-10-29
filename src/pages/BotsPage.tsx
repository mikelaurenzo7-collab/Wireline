import { Link } from "react-router";

import BotMark from "../components/BotMark";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";

/**
 * Bots are durable resources, separate from conversations and browser sessions.
 * Setup and creation continue to use the existing, proven Work flows.
 */
export default function BotsPage() {
  const { agents, loading, degraded, refresh } = useAgents();
  const { resolvedId } = useStudioActiveAgentId();

  return (
    <WorkspaceShell
      title="Bots"
      action={
        <Link
          to="/studio?create=1"
          className="wl-focus-ring-halo inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          New Bot
        </Link>
      }
    >
      <section className="wl-shell-measure mx-auto w-full max-w-4xl pb-12" aria-label="Your Bots">
        <p className="mb-5 text-sm leading-6 text-muted-foreground">
          Choose a Bot to work with, or open its setup.
        </p>

        {loading ? (
          <p role="status" className="py-8 text-sm text-muted-foreground">
            Loading Bots…
          </p>
        ) : null}

        {degraded ? (
          <div role="status" className="mb-5 flex flex-wrap items-center gap-3 border-b border-border pb-4 text-sm text-muted-foreground">
            <span>Bot information may be out of date.</span>
            <button
              type="button"
              onClick={refresh}
              className="wl-focus-ring-halo min-h-11 rounded-md px-2 font-semibold text-foreground underline underline-offset-4"
            >
              Retry
            </button>
          </div>
        ) : null}

        {!loading && agents.length === 0 && !degraded ? (
          <div className="py-12">
            <h2 className="text-lg font-semibold tracking-tight">Create your first Bot</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Give it a role, connect what it needs, then start a conversation in Work.
            </p>
          </div>
        ) : null}

        {agents.length > 0 ? (
          <ul className="divide-y divide-border border-y border-border">
            {agents.map((agent) => {
              const workHref = `/studio?agent=${encodeURIComponent(agent.id)}`;
              const setupHref = `${workHref}&section=setup`;
              const selected = resolvedId === agent.id;
              return (
                <li key={agent.id} className="flex min-h-[76px] flex-wrap items-center gap-3 py-3 sm:gap-5">
                  <Link
                    to={workHref}
                    className="wl-focus-ring-halo flex min-w-0 flex-1 items-center gap-3 rounded-md py-1"
                    aria-label={`Open ${agent.name} in Work`}
                  >
                    <BotMark
                      seed={agent.id}
                      name={agent.name}
                      markKey={agent.mark_key}
                      size={36}
                      title={agent.name}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {agent.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {agent.role || "Bot"}
                        {selected ? " · Current" : ""}
                      </span>
                    </span>
                  </Link>
                  <div className="ml-auto flex shrink-0 items-center gap-1 text-sm">
                    <Link
                      to={workHref}
                      className="wl-focus-ring-halo inline-flex min-h-11 items-center rounded-md px-3 font-medium text-foreground hover:bg-muted"
                    >
                      Work
                    </Link>
                    <Link
                      to={setupHref}
                      className="wl-focus-ring-halo inline-flex min-h-11 items-center rounded-md px-3 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Set up ${agent.name}`}
                    >
                      Set Up
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </WorkspaceShell>
  );
}
