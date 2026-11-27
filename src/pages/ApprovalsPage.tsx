import ApprovalInbox from "../components/ApprovalInbox";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

/** Needs You: what only the owner can do, with the evidence beside it. */
export default function ApprovalsPage() {
  return (
    <WorkspaceShell contentClassName="flex min-h-0 flex-1 flex-col pt-1 pb-4">
      <WorkspacePageFrame mode="standard" className="flex min-h-0 flex-1 flex-col">
        <WorkspacePageIntro title="Needs You" size="compact" />
        <ApprovalInbox embedded />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
