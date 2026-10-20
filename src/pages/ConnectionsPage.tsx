import CrmConnectionCard from "../components/CrmConnectionCard";
import MailboxConnectionCard from "../components/MailboxConnectionCard";
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
      <WorkspacePageFrame mode="standard" className="gap-3">
        <WorkspacePageIntro title="Connections" />

        <MailboxConnectionCard />

        <Accordion type="single" collapsible>
          <AccordionItem value="apps" className="rounded-xl border border-border bg-card">
            <AccordionTrigger className="wl-preserve-case min-h-16 px-4 py-2 text-base font-semibold text-foreground hover:no-underline data-[state=open]:border-b data-[state=open]:border-border">
              <span className="flex flex-col items-start gap-0.5 text-left">
                <span>Business Tools</span>
                <span className="text-xs font-normal text-muted-foreground">
                  CRM, team, social, and spreadsheet tools
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
              <CrmConnectionCard />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
