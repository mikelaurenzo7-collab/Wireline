import { Button } from "./atoms";
import { StatusNotice } from "./molecules";

/**
 * Shown when the agent roster could not be loaded.
 *
 * The distinction this exists to protect: an empty roster and an unavailable
 * roster look identical in `agents.length`, but they mean opposite things to a
 * customer. Rendering the first-run "create your first agent" state on a failed
 * load tells someone with a working workspace that it is empty — and the
 * obvious next action, creating an agent, consumes billed capacity to duplicate
 * something they already have. Every surface that branches on an empty roster
 * checks `degraded` first and renders this instead.
 */
export default function WorkspaceRecovery({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="wl-paper wl-paper-elevated p-6 sm:p-8" aria-label="Workspace recovery">
      <StatusNotice tone="warning" title="Your workspace is reconnecting">
        We could not load your agent roster. Your agents and customer data are unchanged.
      </StatusNotice>
      <Button type="button" variant="secondary" className="mt-4" onClick={onRetry}>
        Retry workspace
      </Button>
    </section>
  );
}
