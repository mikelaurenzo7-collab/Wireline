import { Link } from "react-router-dom";

import CrmConnectionCard from "../components/CrmConnectionCard";
import IntegrationOperatingMap from "../components/integrations/IntegrationOperatingMap";
import { Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ConnectionsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame mode="standard" className="gap-4">
        <WorkspacePageIntro title="Wire" />
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
        <IntegrationOperatingMap />
        <CrmConnectionCard />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
