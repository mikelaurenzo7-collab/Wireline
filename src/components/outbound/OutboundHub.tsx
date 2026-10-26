import { useState } from "react";
import { ChevronDown, Phone } from "lucide-react";
import OutboundDialDialog from "../OutboundDialDialog";
import { Button } from "../atoms";
import { EmptyState } from "../ui/EmptyState";
import { CAMPAIGN_CALLING_TITLE } from "../../lib/product-copy";
import RecipientVoicePermissions from "./RecipientVoicePermissions";
import CampaignsPanel from "./CampaignsPanel";
import { WorkspaceTabStrip } from "../layout/WorkspaceTabStrip";

export default function OutboundHub({
  activeView,
  onViewChange,
  initialAgentId,
}: {
  activeView: string;
  onViewChange: (id: string) => void;
  initialAgentId?: string;
}) {
  const [showDial, setShowDial] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  // Keep older, unsupported bookmarks recoverable without starting outbound work.
  if (activeView !== "dispatch" && activeView !== "campaigns") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={Phone}
          title={CAMPAIGN_CALLING_TITLE}
          description="Reviewed calls and campaigns are ready. Recipient permission still applies."
          framed
          density="compact"
          withHalo={false}
          actions={[
            { label: "Reviewed Calls", onClick: () => onViewChange("dispatch"), primary: true },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
        <WorkspaceTabStrip
          tabs={[
            { id: "dispatch", label: "Reviewed Calls" },
            { id: "campaigns", label: "Campaigns" },
          ]}
          activeId={activeView}
          onSelect={onViewChange}
          ariaLabel="Outbound Work"
          density="compact"
          align="start"
          className="mb-0 border-b-0 pb-0"
        />
        {activeView === "dispatch" ? (
          <Button type="button" size="sm" onClick={() => setShowDial(true)} aria-label="New Call">
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            New Call
          </Button>
        ) : null}
      </div>
      {activeView === "campaigns" ? (
        <CampaignsPanel initialAgentId={initialAgentId} />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
            <div className="flex w-full flex-col items-center px-3 py-6 sm:px-6">
              <EmptyState
                icon={Phone}
                title="Place a Reviewed Call"
                description="Personal coordination or a specific business service call. The recipient grants permission first."
                framed
                density="compact"
                titleTone="ui"
                withHalo={false}
                className="w-full max-w-lg"
              />
            </div>
            <div className="px-3 pb-4 sm:px-6">
              <details
                className="group rounded-xl border border-border bg-card"
                onToggle={(event) => setShowPermissions(event.currentTarget.open)}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground">
                  Recipient Permissions
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="border-t border-border p-3 sm:p-4">
                  {showPermissions ? <RecipientVoicePermissions /> : null}
                </div>
              </details>
            </div>
          </div>
          <OutboundDialDialog
            open={showDial}
            onClose={() => setShowDial(false)}
            initialAgentId={initialAgentId}
          />
        </>
      )}
    </div>
  );
}
