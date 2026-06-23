import EmailInbox from "../components/EmailInbox";
import WorkspaceShell from "../components/WorkspaceShell";

export default function EmailPage() {
  return (
    <WorkspaceShell eyebrow="Conversations" title="Inbox" contentClassName="pt-0 pb-0">
      <EmailInbox embedded />
    </WorkspaceShell>
  );
}
