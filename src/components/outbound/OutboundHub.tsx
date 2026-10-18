import { DIRECT_OUTBOUND_AVAILABILITY } from "../../lib/outbound-call-purpose";
import { useState } from "react";
import { ChevronDown, Phone, Zap } from "lucide-react";
import OutboundDialDialog from "../OutboundDialDialog";
import Cadences from "../Cadences";
import CampaignsPanel from "./CampaignsPanel";
import CallbacksPanel from "./CallbacksPanel";
import IntakeKeysManager from "../IntakeKeysManager";
import { WorkspaceTabStrip } from "../layout/WorkspaceTabStrip";
import { OUTBOUND_VIEW_TABS } from "../../lib/page-sub-tabs";
import { Button } from "../atoms";
import { EmptyState } from "../ui/EmptyState";
import RecipientVoicePermissions from "./RecipientVoicePermissions";

type OutboundView = (typeof OUTBOUND_VIEW_TABS)[number]["id"];

export default function OutboundHub({
  activeView,
  onViewChange,
}: {
  activeView: OutboundView;
  onViewChange: (id: OutboundView) => void;
}) {
  const [showDial, setShowDial] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 sm:px-4">
        <label className="relative min-w-0 flex-1 sm:hidden">
          <span className="sr-only">Outbound section</span>
          <select
            value={activeView}
            onChange={(event) => onViewChange(event.target.value as OutboundView)}
            className="h-10 w-full appearance-none rounded-lg border border-border bg-card px-3 pr-9 text-sm font-semibold text-foreground outline-none focus:border-primary/50"
          >
            {OUTBOUND_VIEW_TABS.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
        </label>
        <WorkspaceTabStrip
          tabs={OUTBOUND_VIEW_TABS}
          activeId={activeView}
          onSelect={(id) => onViewChange(id as OutboundView)}
          ariaLabel="Outbound sections"
          density="compact"
          align="start"
          className="mb-0 hidden min-w-0 flex-1 border-b-0 pb-0 sm:flex"
        />
        {activeView === "dispatch" ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() => setShowDial(true)}
            aria-label={DIRECT_OUTBOUND_AVAILABILITY.available ? "Dial now" : "Call my phone"}
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{DIRECT_OUTBOUND_AVAILABILITY.available ? "Dial" : "Call my phone"}</span>
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
        {activeView === "dispatch" && (
          <div className="flex min-h-full flex-col">
            <div className="flex w-full flex-col items-center px-3 py-6 sm:px-6">
              <EmptyState
                icon={Zap}
                title="No Calls Queued"
                framed
                density="compact"
                titleTone="ui"
                withHalo={false}
                className="w-full max-w-lg"
                actions={[
                  {
                    label: "Find Leads",
                    onClick: () => onViewChange("campaigns"),
                    primary: true,
                  },
                ]}
              />
            </div>
            <div className="px-3 pb-4 sm:px-6">
              <details
                className="group mb-3 rounded-xl border border-border bg-card"
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
              <details className="group rounded-xl border border-border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-foreground">
                  Lead Intake
                  <ChevronDown
                    className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="border-t border-border p-3 sm:p-4">
                  <IntakeKeysManager />
                </div>
              </details>
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
