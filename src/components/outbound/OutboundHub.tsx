import { useState } from "react";
import { Phone } from "lucide-react";
import OutboundDialDialog from "../OutboundDialDialog";
import Cadences from "../Cadences";
import CampaignsPanel from "./CampaignsPanel";
import CallbacksPanel from "./CallbacksPanel";
import IntakeKeysManager from "../IntakeKeysManager";
import { WorkspaceTabStrip } from "../layout/WorkspaceTabStrip";
import { OUTBOUND_VIEW_TABS } from "../../lib/page-sub-tabs";
import { Button } from "../atoms";

type OutboundView = (typeof OUTBOUND_VIEW_TABS)[number]["id"];

export default function OutboundHub({
  activeView,
  onViewChange,
}: {
  activeView: OutboundView;
  onViewChange: (id: OutboundView) => void;
}) {
  const [showDial, setShowDial] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <WorkspaceTabStrip
          tabs={OUTBOUND_VIEW_TABS}
          activeId={activeView}
          onSelect={(id) => onViewChange(id as OutboundView)}
          ariaLabel="Outbound sections"
          density="compact"
          align="start"
          className="mb-0 min-w-0 flex-1 border-b-0 pb-0"
        />
        {activeView === "dispatch" && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setShowDial(true)}
            aria-label="Dial now"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Dial now</span>
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
        {activeView === "dispatch" && (
          <div className="flex min-h-0 flex-col">
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <div className="max-w-2xl">
                <h2 className="text-base font-semibold text-foreground">
                  Outbound dispatch
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Place one-off calls or accept form leads. Consent checks run before every dial.
                </p>
              </div>
            </div>
            <div className="px-4 py-4 sm:px-6">
              <IntakeKeysManager />
            </div>
          </div>
        )}
        {activeView === "campaigns" && <CampaignsPanel />}
        {activeView === "sequences" && <Cadences />}
        {activeView === "callbacks" && <CallbacksPanel />}
      </div>
      <OutboundDialDialog open={showDial} onClose={() => setShowDial(false)} />
    </div>
  );
}
