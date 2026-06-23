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
import PostureBadge from "../components/ui/PostureBadge";
import { useAgents } from "../contexts/AgentsContext";
import { PRODUCT_POSTURE, PRODUCT_VERSATILITY, rosterSummary } from "../lib/product-copy";

const roleLabel = (role: string | null) =>
  (role || "assistant").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function OverviewPage() {
  const { agents, loading, degraded } = useAgents();
  const personalCount = agents.filter((agent) => !agent.is_business_agent).length;
  const businessCount = agents.filter((agent) => agent.is_business_agent).length;

  return (
    <WorkspaceShell
      title="Overview"
      eyebrow="Workspace"
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
              <p className="studio-kicker">Today</p>
              <h2 className="wl-section-title mt-3 max-w-[24ch] text-[clamp(1.75rem,1.4rem+1.6vw,2.5rem)]">
                Put the next conversation in motion.
              </h2>
              <p className="wl-page-copy mt-3">
                Start with one useful brief. Wireline can handle the call, follow-up, or inbox task while you keep the rules and the final decision.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/studio?create=1" className="studio-primary-button text-sm">
                Create an assistant <ArrowRight size={16} />
              </Link>
              <Link to="/connections" className="studio-secondary-button text-sm">
                Connect a tool
              </Link>
            </div>
          </div>

          <aside className="wl-overview-status studio-card flex flex-col justify-between">
            <div>
              <p className="studio-kicker">Roster</p>
              <div className="mt-5 flex items-end gap-2">
                <span className="wl-metric-value">{loading ? "—" : agents.length}</span>
                <span className="pb-0.5 text-sm text-muted-foreground">active</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {degraded
                  ? "Some workspace data could not be refreshed. Check your connections before depending on an assistant or agent."
                  : agents.length
                    ? rosterSummary(personalCount, businessCount)
                    : PRODUCT_VERSATILITY.short}
              </p>
            </div>
            <Link
              to="/agents"
              className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-[color:var(--wl-accent-hover)]"
            >
              View assistants <ArrowRight size={15} />
            </Link>
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="studio-card flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <User className="size-5 text-primary" />
              <h2 className="wl-card-title">Personal assistants</h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{PRODUCT_POSTURE.personal.emptyBody}</p>
            <Link to="/studio?create=1" className="studio-secondary-button mt-auto w-fit text-sm">
              {PRODUCT_POSTURE.personal.createCta}
            </Link>
          </article>
          <article className="studio-card flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Briefcase className="size-5 text-primary" />
              <h2 className="wl-card-title">Business agents</h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{PRODUCT_POSTURE.business.emptyBody}</p>
            <Link
              to="/studio?create=1&posture=business"
              className="studio-secondary-button mt-auto w-fit text-sm"
            >
              {PRODUCT_POSTURE.business.createCta}
            </Link>
          </article>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <Link to="/inbox" className="wl-overview-action studio-card wl-card-action group block min-h-[210px] text-left">
            <Radio className="size-5 text-primary" />
            <h2 className="wl-card-title mt-5">Review what happened</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Read conversations, handoffs, and replies from personal assistants and business agents.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Open inbox <ArrowRight size={15} />
            </span>
          </Link>
          <Link to="/knowledge" className="wl-overview-action studio-card wl-card-action group block min-h-[210px] text-left">
            <FileText className="size-5 text-primary" />
            <h2 className="wl-card-title mt-5">Keep answers current</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Give each assistant the facts, policies, and boundaries it needs before the conversation starts.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Open knowledge <ArrowRight size={15} />
            </span>
          </Link>
          <Link to="/connections" className="wl-overview-action studio-card wl-card-action group block min-h-[210px] text-left">
            <Cable className="size-5 text-primary" />
            <h2 className="wl-card-title mt-5">Connect useful actions</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Connect calendars, inboxes, and systems only when an assistant needs them to do an approved job.
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Review connections <ArrowRight size={15} />
            </span>
          </Link>
        </section>

        <section className="studio-card">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="studio-kicker">Your roster</p>
              <h2 className="wl-section-title mt-2">Assistants ready for work</h2>
            </div>
            <Link to="/agents" className="studio-secondary-button text-sm">
              Manage assistants
            </Link>
          </div>
          {degraded ? (
            <div className="mt-5 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[color:color-mix(in_srgb,var(--wl-status-warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--wl-status-warning)_8%,var(--card))] p-4 text-sm text-foreground">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--wl-status-warning)]" />
              <p>
                Workspace status is partially unavailable. Roster data shown here may be stale until the connection recovers.
              </p>
            </div>
          ) : null}
          {loading ? (
            <p className="py-10 text-sm text-muted-foreground">Loading roster…</p>
          ) : agents.length ? (
            <div className="grid gap-3 pt-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {agents.slice(0, 8).map((agent) => (
                <Link
                  key={agent.id}
                  to={`/studio?agent=${encodeURIComponent(agent.id)}`}
                  className="studio-card wl-card-action group min-h-[196px] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                      <Bot size={18} />
                    </span>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="wl-overline text-[10px]">{agent.channel || "voice"}</span>
                      <PostureBadge isBusiness={Boolean(agent.is_business_agent)} compact />
                    </div>
                  </div>
                  <h3 className="wl-card-title mt-5">{agent.name}</h3>
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
                <h3 className="wl-section-title">{PRODUCT_POSTURE.personal.emptyTitle}</h3>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  {PRODUCT_VERSATILITY.tagline} Create a personal assistant first, then add business agents when work needs a professional line.
                </p>
              </div>
              <Link to="/studio?create=1" className="studio-primary-button text-sm">
                <Plus size={16} /> Create an assistant
              </Link>
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}
