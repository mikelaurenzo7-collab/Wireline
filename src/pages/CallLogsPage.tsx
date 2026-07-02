import CallLogsClaude from "../components/CallLogsClaude";
import WorkspaceShell from "../components/WorkspaceShell";

export default function CallLogsPage() {
  return (
    <WorkspaceShell
      eyebrow="Operate"
      title="Call Logs"
      description="Live floor, intel, triage, and analytics from your real call history."
      contentClassName="pt-0 pb-0"
    >
      <CallLogsClaude />
    </WorkspaceShell>
  );
}
