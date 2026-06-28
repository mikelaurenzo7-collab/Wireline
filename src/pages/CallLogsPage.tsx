import CallLogs from "../components/CallLogs";
import WorkspaceShell from "../components/WorkspaceShell";

export default function CallLogsPage() {
  return (
    <WorkspaceShell eyebrow="Operate" title="Call Logs" contentClassName="pt-2 pb-8">
      <CallLogs embedded />
    </WorkspaceShell>
  );
}
