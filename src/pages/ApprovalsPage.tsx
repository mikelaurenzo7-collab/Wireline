import ApprovalInbox from "../components/ApprovalInbox";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

/** Approval Inbox — review proposed post-call actions with evidence. */
export default function ApprovalsPage() {
  return (
    <WorkspaceShell contentClassName="flex min-h-0 flex-1 flex-col pt-1 pb-8">
      <WorkspacePageFrame mode="standard" className="flex min-h-0 flex-1 flex-col">
        <WorkspacePageIntro
          title="Approvals"
          description="Every proposed action cites call evidence. Approve, edit, or reject before execution."
        />
        <ApprovalInbox embedded />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
