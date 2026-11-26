import { useState } from "react";
import { ChevronDown, Phone } from "lucide-react";
import OutboundDialDialog from "../OutboundDialDialog";
import { Button } from "../atoms";
import { EmptyState } from "../ui/EmptyState";
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

  // Retired views (sequences / callbacks) resolve to Dispatch upstream —
  // every non-Campaigns view renders the Dispatch surface below.

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-3 py-2 sm:px-4">
        <WorkspaceTabStrip
          tabs={[
            { id: "dispatch", label: "Call" },
            { id: "campaigns", label: "Campaigns" },
          ]}
          activeId={activeView}
          onSelect={onViewChange}
          ariaLabel="Outbound Work"
          density="compact"
          align="start"
          className="mb-0 border-b-0 pb-0"
        />
      </div>
      {activeView === "campaigns" ? (
        <CampaignsPanel initialAgentId={initialAgentId} />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
            {/* One centered column, so the call card and its permissions line up. */}
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-3 py-6 sm:px-6">
              <EmptyState
                icon={Phone}
                title="Place a Call"
                description="Your Bot calls from the number it answers on, and BotBound screens every call before it dials."
                framed
                density="compact"
                titleTone="ui"
                withHalo={false}
                className="w-full"
                action={
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setShowDial(true)}
                    aria-label="New Call"
                  >
                    <Phone className="size-3.5" aria-hidden="true" />
                    New Call
                  </Button>
                }
              />
              <details
                className="group rounded-xl border border-border bg-card"
                onToggle={(event) => setShowPermissions(event.currentTarget.open)}
              >
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold text-foreground">
                  <span className="flex-1">Recipient Permissions</span>
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
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
