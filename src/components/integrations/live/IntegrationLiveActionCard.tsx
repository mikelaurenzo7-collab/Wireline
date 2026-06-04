/**
 * Single integration live-action box — drops in with brand chrome + tailored mini UI.
 */
import React from "react";
import { motion } from "motion/react";
import { Check, Loader2, Compass } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { IntegrationLiveAction } from "../../../lib/integration-live-scripts";
import { INTEGRATION_STYLES } from "../../../lib/integration-activities";
import { WIRELINE_DIRECTOR_BRAND, WL_APP_CLASSES } from "../../../lib/wireline-director-design";
import type { ToolIntegration } from "../../../lib/agent-capabilities";
import { IntegrationLiveVisual } from "./IntegrationLiveVisuals";
import { Badge } from "../../ui/shadcn/Badge";

const DIRECTOR_BRAND = { name: "Director", color: WIRELINE_DIRECTOR_BRAND.violet };

function resolveBrand(integration: IntegrationLiveAction["integration"]) {
  if (integration === "director") return DIRECTOR_BRAND;
  const style = INTEGRATION_STYLES[integration as ToolIntegration];
  return style ? { name: style.name, color: style.color } : DIRECTOR_BRAND;
}

export default function IntegrationLiveActionCard({
  action,
  index,
}: {
  action: IntegrationLiveAction;
  index: number;
}) {
  const brand = resolveBrand(action.integration);
  const isActive = action.status === "active";
  const isSuccess = action.status === "success";
  const isProposal = action.source === "proposal";

  return (
    <motion.div
      layout
      data-proposal={isProposal ? "true" : undefined}
      initial={{ opacity: 0, y: -28, scale: 0.94, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: 420,
        damping: 32,
        delay: index * 0.02,
      }}
      className={cn(
        "wl-integration-live-card relative overflow-hidden rounded-md border bg-card shadow-sm",
        isActive && "border-brand/25 shadow-md shadow-brand/8 ring-1 ring-brand/10",
        isSuccess && "border-brand/30",
        isProposal && !isActive && !isSuccess && "bg-brand/[0.02]",
        !isActive && !isSuccess && !isProposal && "border-border opacity-70",
      )}
    >
      <div
        className="h-1 w-full"
        style={{
          background: `linear-gradient(90deg, ${brand.color}, ${brand.color}88, transparent)`,
        }}
      />

      <div className="px-3.5 pt-3 pb-3">
        <div className="flex items-start gap-2.5 mb-2.5">
          <div
            className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md text-primary-foreground shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${brand.color}, ${brand.color}cc)`,
            }}
          >
            {action.integration === "director" ? (
              <Compass className="w-4 h-4" />
            ) : (
              <span className="flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">
                {INTEGRATION_STYLES[action.integration as ToolIntegration]?.icon}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-ink tracking-[-0.01em]">
                {brand.name}
              </span>
              <StatusPill status={action.status} isProposal={isProposal} />
            </div>
            <p className="text-[12px] font-semibold text-ink/90 leading-tight mt-0.5">
              {action.title}
            </p>
            <p className="text-[10px] text-muted/80 mt-0.5">{action.detail}</p>
          </div>
        </div>

        <IntegrationLiveVisual
          kind={action.visual}
          payload={action.payload}
          status={action.status}
        />

        {isSuccess && action.resultLine && (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2.5 flex items-center gap-1.5 text-[10px] font-medium text-brand"
          >
            <Check className="w-3 h-3 shrink-0" />
            {action.resultLine}
          </motion.p>
        )}

        {isActive && (
          <div className="mt-2.5 h-0.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-brand"
              initial={{ width: "8%" }}
              animate={{ width: ["8%", "72%", "88%"] }}
              transition={{ duration: 1.8, ease: "easeInOut" }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}

function StatusPill({
  status,
  isProposal,
}: {
  status: IntegrationLiveAction["status"];
  isProposal: boolean;
}) {
  if (isProposal && status === "pending") {
    return (
      <Badge
        variant="outline"
        className="px-1.5 py-0.5 text-[8px] uppercase tracking-wider border-dashed border-brand/35 text-brand"
      >
        Proposed
      </Badge>
    );
  }
  if (status === "active") {
    return (
      <Badge className="gap-1 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider bg-brand/10 text-brand border-brand/15 hover:bg-brand/10">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        Live
      </Badge>
    );
  }
  if (status === "success") {
    return (
      <Badge
        className={cn(
          "gap-1 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider hover:bg-brand/10",
          WL_APP_CLASSES.statusOk,
        )}
      >
        <Check className="w-2.5 h-2.5" />
        Done
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-muted-foreground border-transparent"
    >
      Queued
    </Badge>
  );
}
