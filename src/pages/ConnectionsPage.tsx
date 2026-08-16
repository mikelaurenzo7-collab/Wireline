import { Link } from "react-router";

import CrmConnectionCard from "../components/CrmConnectionCard";
import MailboxConnectionCard from "../components/MailboxConnectionCard";
import IntegrationOperatingMap from "../components/integrations/IntegrationOperatingMap";
import { Button } from "../components/atoms";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../components/ui/shadcn/Accordion";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ConnectionsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard" className="gap-4">
        <WorkspacePageIntro
          title="Connections"
          titleHidden="lg"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link to="/settings/phone#company-identity">Caller identity</Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link to="/settings/phone">Phone setup</Link>
              </Button>
            </div>
          }
        />
        <MailboxConnectionCard />
        <CrmConnectionCard />
        <Accordion type="single" collapsible data-wireline-integration-map>
          <AccordionItem
            value="integration-capabilities"
            className="rounded-[var(--wireline-radius-lg)] border border-[color-mix(in_srgb,var(--wireline-color-border-default)_88%,transparent)] bg-[color-mix(in_srgb,var(--wireline-color-surface-default)_88%,var(--wireline-color-canvas-default))]"
          >
            <AccordionTrigger className="min-h-14 px-4 py-0 text-sm font-semibold text-foreground hover:no-underline data-[state=open]:border-b data-[state=open]:border-border">
              Integration capabilities
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
              <IntegrationOperatingMap />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
