import CallLogsClaude from "../components/CallLogsClaude";
import WorkspaceShell from "../components/WorkspaceShell";

export default function CallLogsPage() {
  return (
    <WorkspaceShell contentClassName="pt-0 pb-0" fullBleed>
      <h1 className="sr-only">Calls</h1>
      <CallLogsClaude />
    </WorkspaceShell>
  );
}
