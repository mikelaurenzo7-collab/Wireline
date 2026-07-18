import CallLogs from "../components/CallLogs";
import WorkspaceShell from "../components/WorkspaceShell";

export default function CallLogsPage() {
  return (
    <WorkspaceShell contentClassName="pt-0 pb-0" fullBleed>
      <CallLogs />
    </WorkspaceShell>
  );
}
