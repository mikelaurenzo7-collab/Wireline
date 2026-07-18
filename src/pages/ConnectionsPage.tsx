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
        <WorkspacePageIntro
          title="Connections"
          action={
            <Button asChild size="sm" variant="secondary">
              <Link to="/settings/phone">Phone setup</Link>
            </Button>
          }
        />
        <MailboxConnectionCard />
        <CrmConnectionCard />
        <details data-wireline-integration-map>
          <summary>Integration capabilities</summary>
          <div className="p-3 sm:p-4">
            <IntegrationOperatingMap />
          </div>
        </details>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
