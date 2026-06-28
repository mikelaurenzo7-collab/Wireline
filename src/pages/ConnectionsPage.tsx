import Integrations from "../components/Integrations";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ConnectionsPage() {
  return (
    <WorkspaceShell eyebrow="Operate" title="Connections" contentClassName="pt-2 pb-8">
      <Integrations />
    </WorkspaceShell>
  );
}
