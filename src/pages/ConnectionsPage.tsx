import CrmConnectionCard from "../components/CrmConnectionCard";
import IntegrationOperatingMap from "../components/integrations/IntegrationOperatingMap";
import { Link } from "react-router-dom";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ConnectionsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame className="max-w-[1080px] gap-4">
        <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">Next action: wire a channel</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect CRM context here, then add or verify a phone line so the first agent can take
            real calls.
          </p>
          <Link
            to="/settings/phone"
            className="mt-3 inline-flex rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            Open phone setup
          </Link>
        </section>
        <IntegrationOperatingMap />
        <CrmConnectionCard />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
