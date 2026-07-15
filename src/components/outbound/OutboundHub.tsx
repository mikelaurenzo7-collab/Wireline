import { useState } from "react";
import { KeyRound, Phone, ShieldCheck } from "lucide-react";
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
      <div className="min-h-0 flex-1 overflow-visible">
        {activeView === "dispatch" && (
          <div className="flex min-h-0 flex-col">
            <div className="border-b border-border px-4 py-4 sm:px-6 sm:py-5">
              <div className="max-w-2xl">
                <p className="wl-label mb-2 text-brand">Outbound dispatch</p>
                <h2 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
                  Start compliant outbound without leaving Phone.
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Place one-off calls or route consented leads. Compliance checks stay enforced.
                </p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  {
                    icon: Phone,
                    title: "One-off calls",
                    body: "Dial a requested callback or service follow-up with purpose logged.",
                  },
                  {
                    icon: KeyRound,
                    title: "Lead intake",
                    body: "Issue scoped API keys for forms and partner lead sources.",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Consent checks",
                    body: "Marketing calls require express consent; service calls stay separate.",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="min-w-0 rounded-md border border-border bg-card/60 p-3 sm:p-4"
                    >
                      <Icon className="mb-2 h-4 w-4 text-brand sm:mb-3" aria-hidden />
                      <h3 className="text-xs font-semibold leading-4 text-foreground sm:text-sm">
                        {item.title}
                      </h3>
                      <p className="mt-1.5 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                        {item.body}
                      </p>
                    </div>
                  );
                })}
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
