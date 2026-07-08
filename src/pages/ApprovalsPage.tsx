import ApprovalInbox from "../components/ApprovalInbox";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

/** Approval Inbox — review proposed post-call actions with evidence. */
export default function ApprovalsPage() {
  return (
    <WorkspaceShell contentClassName="flex min-h-0 flex-1 flex-col pt-1 pb-8">
      <WorkspacePageFrame className="flex min-h-0 flex-1 flex-col">
        <WorkspacePageIntro
          align="start"
          title="Approvals"
          action={
            <p className="max-w-md text-right text-xs leading-relaxed text-muted-foreground">
              Every proposed action cites call evidence. Approve, edit, or reject before execution.
            </p>
          }
        />
        <ApprovalInbox embedded />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
