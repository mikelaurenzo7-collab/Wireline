/**
 * Single integration live-action box — drops in with brand chrome + tailored mini UI.
 */
import React from "react";
import { motion } from "motion/react";
import { Check, Loader2, Compass } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { IntegrationLiveAction } from "../../../lib/integration-live-scripts";
import { INTEGRATION_STYLES } from "../../../lib/integration-activities";
import {
  WIRELINE_DIRECTOR_BRAND,
  WL_APP_CLASSES,
  WL_DIRECTOR_CLASSES,
} from "../../../lib/wireline-director-design";
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
  variant = "default",
}: {
  action: IntegrationLiveAction;
  index: number;
  /** Hero treatment inside DirectorLiveOrchestra spotlight */
  variant?: "default" | "spotlight";
}) {
  const brand = resolveBrand(action.integration);
  const isActive = action.status === "active";
  const isSuccess = action.status === "success";
  const isProposal = action.source === "proposal";

  const accentStyle = {
    "--wl-integration-accent": isSuccess ? "var(--wl-signal)" : brand.color,
  } as React.CSSProperties;

  return (
    <motion.div
      layout
      data-proposal={isProposal ? "true" : undefined}
      data-active={isActive ? "true" : undefined}
      data-success={isSuccess ? "true" : undefined}
      style={accentStyle}
      initial={
        variant === "spotlight"
          ? { opacity: 0, y: 12, scale: 0.98 }
          : { opacity: 0, y: -28, scale: 0.94, filter: "blur(4px)" }
      }
      animate={
        variant === "spotlight"
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }
      }
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{
        type: "spring",
        stiffness: variant === "spotlight" ? 360 : 420,
        damping: 32,
        delay: variant === "spotlight" ? 0 : index * 0.02,
      }}
      className={cn(
        "wl-integration-live-card relative overflow-hidden rounded-md border bg-card shadow-sm",
        variant === "spotlight" &&
          isActive &&
          "border-brand/30 shadow-xl shadow-brand/15 ring-2 ring-brand/20",
        variant !== "spotlight" &&
          isActive &&
          "border-brand/25 shadow-lg shadow-brand/10 ring-1 ring-brand/12",
        variant === "spotlight" && !isActive && "ring-1 ring-brand/10",
        isSuccess &&
          "border-[color-mix(in_srgb,var(--wl-signal)_30%,transparent)] shadow-sm shadow-[color-mix(in_srgb,var(--wl-signal)_8%,transparent)]",
        isProposal && !isActive && !isSuccess && "bg-brand/[0.02]",
        !isActive && !isSuccess && !isProposal && "border-border opacity-70",
      )}
    >
      <div className="wl-integration-live-card__brand-bar" aria-hidden="true" />

      <div className="wl-integration-live-card__wash" aria-hidden="true" />

      <div className="relative px-3.5 pt-3 pb-3">
        <div className="flex items-start gap-2.5 mb-2.5">
          <div
            className={cn(
              "wl-integration-live-card__icon shrink-0 flex h-8 w-8 items-center justify-center rounded-md text-primary-foreground shadow-sm transition-all duration-300",
              isSuccess && "wl-integration-live-card__icon--success",
            )}
          >
            {isSuccess ? (
              <Check className="w-4 h-4" />
            ) : action.integration === "director" ? (
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
            <p className={cn(WL_APP_CLASSES.bodyCaption, "mt-0.5")}>{action.detail}</p>
          </div>
        </div>

        <IntegrationLiveVisual
          kind={action.visual}
          payload={action.payload}
          status={action.status}
        />

        {isSuccess && action.resultLine && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "mt-2.5 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 border",
              WL_DIRECTOR_CLASSES.metaCaption,
              "font-medium",
              WL_APP_CLASSES.statusSuccess,
              WL_APP_CLASSES.textSuccess,
            )}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[color-mix(in_srgb,var(--wl-signal)_40%,transparent)] animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--wl-signal)]" />
            </span>
            {action.resultLine}
          </motion.div>
        )}

        {isActive && (
          <div className="mt-2.5 h-1 rounded-full bg-muted/30 overflow-hidden">
            <motion.div
              className="wl-integration-live-card__progress h-full rounded-full"
              initial={{ width: "5%" }}
              animate={{ width: ["5%", "65%", "85%"] }}
              transition={{ duration: 2.2, ease: "easeInOut" }}
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
