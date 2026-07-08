import CrmConnectionCard from "../components/CrmConnectionCard";
import IntegrationOperatingMap from "../components/integrations/IntegrationOperatingMap";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ConnectionsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame className="max-w-[1080px] gap-4">
        <IntegrationOperatingMap />
        <CrmConnectionCard />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
