import { useState } from "react";
import { ChevronDown, Phone } from "lucide-react";
import OutboundDialDialog from "../OutboundDialDialog";
import { Button } from "../atoms";
import { EmptyState } from "../ui/EmptyState";
import { CAMPAIGN_CALLING_TITLE } from "../../lib/product-copy";
import RecipientVoicePermissions from "./RecipientVoicePermissions";

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

  // Old bookmarks stay understandable. Campaign modules remain in source for a later launch.
  if (activeView !== "dispatch") {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={Phone}
          title={CAMPAIGN_CALLING_TITLE}
          description="Use Reviewed Calls for individual service calls with recipient permission."
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
      <div className="flex items-center justify-end border-b border-border px-3 py-2 sm:px-4">
        <Button type="button" size="sm" onClick={() => setShowDial(true)} aria-label="New Call">
          <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          New Call
        </Button>
      </div>
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
              Recipient permissions
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
    </div>
  );
}
