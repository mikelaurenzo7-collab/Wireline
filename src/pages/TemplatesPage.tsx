import AgentTemplates from "../components/AgentTemplates";
import WorkspaceShell from "../components/WorkspaceShell";

export default function TemplatesPage() {
  return (
    <WorkspaceShell eyebrow="Create" title="Templates" contentClassName="pt-2 pb-8">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 pb-8">
        <section className="wl-card-lg">
          <p className="wl-eyebrow wl-eyebrow-primary">Start faster</p>
          <h2 className="wl-title-tight mt-3">Proven agent patterns, ready to customize.</h2>
          <p className="wl-body mt-3 max-w-2xl">
            Pick a starting point, set the voice, then finish the details in Studio and Training before the line goes live.
          </p>
        </section>
        <section className="min-h-[640px] overflow-hidden rounded-[14px] border border-border bg-card shadow-[var(--wireline-elevation-sm)]" aria-label="Agent templates">
          <AgentTemplates />
        </section>
      </div>
    </WorkspaceShell>
  );
}
