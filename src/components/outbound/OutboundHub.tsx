import { useState } from "react";
import OutboundDialDialog from "../OutboundDialDialog";
import Cadences from "../Cadences";
import CampaignsPanel from "./CampaignsPanel";
import CallbacksPanel from "./CallbacksPanel";
import IntakeKeysManager from "../IntakeKeysManager";
import { WorkspaceTabStrip } from "../layout/WorkspaceTabStrip";
import { OUTBOUND_VIEW_TABS } from "../../lib/page-sub-tabs";
import { Button } from "../atoms";
import { Phone } from "lucide-react";

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
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <WorkspaceTabStrip
          tabs={OUTBOUND_VIEW_TABS}
          activeId={activeView}
          onSelect={(id) => onViewChange(id as OutboundView)}
          ariaLabel="Outbound sections"
        />
        {activeView === "dispatch" && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setShowDial(true)}>
            <Phone className="h-3.5 w-3.5" aria-hidden />
            Dial now
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeView === "dispatch" && (
          <div className="flex h-full min-h-0 flex-col overflow-auto">
            <div className="border-b border-border px-6 py-4 text-sm text-muted-foreground max-w-2xl">
              Place a one-off outbound call with TCPA consent checks, or connect lead intake for
              automated campaign dialing.
            </div>
            <IntakeKeysManager />
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
