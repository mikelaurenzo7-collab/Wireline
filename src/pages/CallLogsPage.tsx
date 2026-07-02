import CallLogsClaude from "../components/CallLogsClaude";
import WorkspaceShell from "../components/WorkspaceShell";

export default function CallLogsPage() {
  return (
    <WorkspaceShell title="Call Logs" contentClassName="pt-0 pb-0">
      <CallLogsClaude />
    </WorkspaceShell>
  );
}
