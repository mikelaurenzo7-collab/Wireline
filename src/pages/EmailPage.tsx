import EmailInbox from "../components/EmailInbox";
import WorkspaceShell from "../components/WorkspaceShell";

export default function EmailPage() {
  return (
    <WorkspaceShell eyebrow="Conversations" title="Inbox" contentClassName="pt-2 pb-8">
      <div className="wl-inbox-route min-h-full">
        <EmailInbox embedded />
      </div>
    </WorkspaceShell>
  );
}
