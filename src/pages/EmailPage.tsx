import EmailInbox from "../components/EmailInbox";
import WorkspaceShell from "../components/WorkspaceShell";

export default function EmailPage() {
  return (
    <WorkspaceShell eyebrow="Conversations" title="Inbox" contentClassName="py-6">
      <div className="wl-inbox-route min-h-full">
        <EmailInbox embedded />
      </div>
    </WorkspaceShell>
  );
}
