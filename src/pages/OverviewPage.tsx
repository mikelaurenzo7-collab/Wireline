import {
  ArrowRight,
  Bot,
  Briefcase,
  Cable,
  CircleAlert,
  FileText,
  Plus,
  Radio,
  User,
} from "lucide-react";
import { Link } from "react-router-dom";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";

const roleLabel = (role: string | null) =>
  (role || "assistant").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function OverviewPage() {
  const { agents, loading, degraded } = useAgents();

  return (
    <WorkspaceShell
      title="Workspace overview"
      eyebrow="Your day"
      action={
        <Link to="/studio?create=1" className="studio-primary-button text-sm">
          <Plus size={16} />
          New assistant
        </Link>
      }
      contentClassName="py-6"
    >
      <div className="flex w-full max-w-none flex-col gap-5 pb-8">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,.8fr)]">
          <div className="wl-overview-hero studio-card flex flex-col justify-between border-primary/20 bg-secondary">
            <div>
              <p className="studio-kicker">Your coverage</p>
              <h2 className="mt-3 max-w-[18ch] font-[var(--wl-font-display)] text-3xl font-semibold tracking-[-.03em] text-foreground sm:text-4xl">
                Give Wireline the calls and messages that should not wait.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                Start with one useful task. Add knowledge, connected accounts, and deeper business
                setup only when they make the outcome better.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/studio?create=1" className="studio-primary-button text-sm">
                Create an assistant <ArrowRight size={16} />
              </Link>
              <Link to="/actions" className="studio-secondary-button text-sm">
                Connect an account
              </Link>
            </div>
          </div>

          <aside className="wl-overview-status studio-card flex flex-col justify-between">
            <div>
              <p className="studio-kicker">Workspace status</p>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="font-[var(--wl-font-display)] text-5xl font-semibold tracking-[-.04em] text-foreground">
                  {loading ? "—" : agents.length}
                </span>
                <span className="text-sm text-muted-foreground">
                  assistant{agents.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {degraded
                  ? "Some workspace data could not be refreshed. Check your connections before depending on an assistant."
                  : agents.length
                    ? "Your assistants are ready to review, improve, and use."
                    : "Start with one useful task. You can keep it personal or add business context later."}
              </p>
            </div>
            <Link
              to="/agents"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-[color:var(--wl-accent-hover)]"
            >
              Review assistants <ArrowRight size={15} />
            </Link>
          </aside>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Link to="/inbox" className="wl-overview-action studio-card group block text-left">
            <Radio className="size-5 text-primary" />
            <h2 className="mt-5 font-[var(--wl-font-display)] text-lg font-semibold text-foreground">
              Review what happened
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Read conversations, handoffs, and replies without losing their context.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Open inbox <ArrowRight size={15} />
            </span>
          </Link>
          <Link to="/knowledge" className="wl-overview-action studio-card group block text-left">
            <FileText className="size-5 text-primary" />
            <h2 className="mt-5 font-[var(--wl-font-display)] text-lg font-semibold text-foreground">
              Keep answers current
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Give assistants facts, documents, policies, and boundaries they can rely on.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Open knowledge <ArrowRight size={15} />
            </span>
          </Link>
          <Link to="/actions" className="wl-overview-action studio-card group block text-left">
            <Cable className="size-5 text-primary" />
            <h2 className="mt-5 font-[var(--wl-font-display)] text-lg font-semibold text-foreground">
              Connect useful actions
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Connect calendars, inboxes, and systems only when an assistant needs them.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Review connections <ArrowRight size={15} />
            </span>
          </Link>
        </section>

        <section className="studio-card">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="studio-kicker">Assistants</p>
              <h2 className="mt-1 font-[var(--wl-font-display)] text-xl font-semibold text-foreground">
                Ready to work
              </h2>
            </div>
            <Link to="/agents" className="studio-secondary-button text-sm">
              Manage all
            </Link>
          </div>
          {degraded ? (
            <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[color:color-mix(in_srgb,var(--wl-status-warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--wl-status-warning)_8%,var(--card))] p-4 text-sm text-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--wl-status-warning)]" />
              <p>
                Workspace status is partially unavailable. Assistant data shown here may be stale until
                the connection recovers.
              </p>
            </div>
          ) : null}
          {loading ? (
            <p className="py-10 text-sm text-muted-foreground">Loading assistants…</p>
          ) : agents.length ? (
            <div className="grid gap-3 pt-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {agents.slice(0, 8).map((agent) => (
                <Link
                  key={agent.id}
                  to={`/studio?agent=${encodeURIComponent(agent.id)}`}
                  className="group rounded-[var(--radius-lg)] border border-border bg-card p-4 transition hover:border-primary/45 hover:bg-secondary active:scale-[0.98]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-9 place-items-center rounded-[var(--radius)] bg-accent text-primary">
                      <Bot size={18} />
                    </span>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="font-mono text-[11px] font-medium uppercase tracking-[.05em] text-muted-foreground">
                        {agent.channel || "voice"}
                      </span>
                      {agent.is_business_agent ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-accent px-2 py-0.5 text-[9px] font-semibold text-primary">
                          <Briefcase size={9} />
                          Business
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[9px] font-semibold text-foreground">
                          <User size={9} className="text-primary" />
                          Personal
                        </span>
                      )}
                    </div>
                  </div>
                  <h3 className="mt-5 font-[var(--wl-font-display)] text-base font-semibold text-foreground">
                    {agent.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{roleLabel(agent.role)}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    Open Studio <ArrowRight size={15} />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 py-10">
              <Bot className="size-6 text-primary" />
              <div>
                <h3 className="font-[var(--wl-font-display)] text-lg font-semibold text-foreground">
                  Start with one assistant
                </h3>
                <p className="mt-1 max-w-lg text-sm leading-6 text-muted-foreground">
                  Create a personal call assistant first. You can add business context, actions, and
                  deeper behavior after the first useful brief.
                </p>
              </div>
              <Link to="/studio?create=1" className="studio-primary-button text-sm">
                <Plus size={16} /> Create assistant
              </Link>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
