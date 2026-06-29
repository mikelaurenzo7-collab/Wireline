import CallLogsClaude from "../components/CallLogsClaude";
import WorkspaceShell from "../components/WorkspaceShell";

export default function CallLogsPage() {
  return (
    <WorkspaceShell eyebrow="Operate" title="Call Logs" contentClassName="pt-0 pb-0">
      <CallLogsClaude />
    </WorkspaceShell>
  );
}
