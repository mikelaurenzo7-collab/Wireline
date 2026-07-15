import { Link } from "react-router-dom";

import CrmConnectionCard from "../components/CrmConnectionCard";
import MailboxConnectionCard from "../components/MailboxConnectionCard";
import IntegrationOperatingMap from "../components/integrations/IntegrationOperatingMap";
import { Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ConnectionsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame mode="standard" className="gap-4">
        <WorkspacePageIntro title="Connections" />
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">Connect a channel</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with phone, then add the inbox or CRM this employee needs.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/settings/phone">Set up phone</Link>
          </Button>
        </section>
        <MailboxConnectionCard />
        <CrmConnectionCard />
        <div className="mt-2">
          <IntegrationOperatingMap />
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
