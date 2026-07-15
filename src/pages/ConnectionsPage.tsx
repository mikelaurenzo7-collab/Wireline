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
          <p className="text-sm font-semibold text-foreground">Next action: wire a channel</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect CRM context here, then add or verify a phone line so the first agent can take
            real calls.
          </p>
          <Button asChild size="sm" className="mt-3">
            <Link to="/settings/phone">Open phone setup</Link>
          </Button>
        </section>
        <MailboxConnectionCard />
        <CrmConnectionCard />
        <section className="mt-2" aria-labelledby="integration-map-title">
          <h2 id="integration-map-title" className="mb-3 text-sm font-semibold text-foreground">
            How your connected stack works
          </h2>
          <IntegrationOperatingMap />
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
