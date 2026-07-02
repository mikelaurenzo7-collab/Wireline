import AgentTemplates from "../components/AgentTemplates";
import WorkspaceShell from "../components/WorkspaceShell";

export default function TemplatesPage() {
  return (
    <WorkspaceShell title="" eyebrow="" contentClassName="pt-8 pb-10 lg:pt-10">
      <div className="mx-auto w-full max-w-[980px]">
        <header className="mb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Workspace
          </p>
          <h1 className="wl-display-3 mt-3">Templates</h1>
          <p className="mt-4 max-w-[48ch] text-sm leading-7 text-muted-foreground">
            Start from a proven agent playbook — personal errands, front desk, sales, and support.
          </p>
        </header>
        <AgentTemplates />
      </div>
    </WorkspaceShell>
  );
}
