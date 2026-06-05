import { motion } from "motion/react";
import { Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { authFetch } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { WL_OPS_CLASSES, OPS_COPY } from "../../lib/wireline-ops-design";

type OpsIntelligenceRailProps = {
  liveCalls: number;
  fleetAgents: number;
  activatingGrowth: boolean;
  onActivatingGrowthChange: (v: boolean) => void;
};

export function OpsIntelligenceRail({
  liveCalls,
  fleetAgents,
  activatingGrowth,
  onActivatingGrowthChange,
}: OpsIntelligenceRailProps) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();

  return (
    <div className="lg:col-span-4 xl:col-span-3 space-y-3 lg:sticky lg:top-3 lg:self-start">
      <div className={WL_OPS_CLASSES.railCard}>
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="wl-label text-brand font-bold flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/50" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand" />
            </span>
            {OPS_COPY.telemetryTitle}
          </h3>
          <span className="wl-label-muted">{OPS_COPY.telemetryActive}</span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between py-1 border-b border-brand/5">
            <span className="text-[12px] text-ink/50">Active callers</span>
            <motion.span
              key={liveCalls}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[12px] font-mono font-bold text-ink"
            >
              {liveCalls}
            </motion.span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-[12px] text-ink/50">Deployed agents</span>
            <motion.span
              key={fleetAgents}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[12px] font-mono font-bold text-ink"
            >
              {fleetAgents}
            </motion.span>
          </div>
        </div>
      </div>

      <div className={clsx(WL_OPS_CLASSES.railCard, "space-y-2.5")}>
        <div>
          <h4 className="font-display italic text-[15px] leading-tight text-foreground">
            {OPS_COPY.growthTitle}
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {OPS_COPY.growthBody}
          </p>
        </div>

        {fleetAgents > 0 ? (
          <ShadButton
            type="button"
            disableAnimations
            onClick={async () => {
              if (activatingGrowth) return;
              onActivatingGrowthChange(true);
              try {
                const res = await authFetch("/api/jobs/prospect", { method: "POST" });
                if (!res.ok) {
                  const body = await res.json().catch(() => ({}));
                  throw new Error(body.error || `HTTP ${res.status}`);
                }
                const body = (await res.json().catch(() => ({}))) as {
                  prospectingEnabled?: boolean;
                };
                if (body.prospectingEnabled === false) {
                  toastInfo(
                    "Prospecting is disabled",
                    "Open Settings → Growth to enable autonomous prospecting and configure targeting.",
                  );
                } else {
                  toastSuccess(
                    "Growth engine queued",
                    "New leads will appear in Outbound when sourcing completes.",
                  );
                }
              } catch (err) {
                const error = err as Error;
                toastError(
                  "Failed to queue prospecting",
                  error.message || "Check network and try again.",
                );
              } finally {
                onActivatingGrowthChange(false);
              }
            }}
            disabled={activatingGrowth}
            className="touch-press w-full gap-2 rounded-md bg-gradient-to-br from-brand to-brand-deep py-2.5 text-on-brand shadow-sm shadow-brand/20 disabled:cursor-wait"
          >
            <Zap
              className={clsx("w-3.5 h-3.5 fill-current", activatingGrowth && "animate-pulse")}
            />
            <span className="text-[11px] font-black uppercase tracking-widest">
              {activatingGrowth ? OPS_COPY.growthCtaBusy : OPS_COPY.growthCta}
            </span>
          </ShadButton>
        ) : (
          <ShadButton
            type="button"
            variant="outline"
            disableAnimations
            onClick={() => navigate("/agents")}
            title="Create an agent first"
            className="touch-press w-full gap-2 rounded-md border-brand/20 bg-brand/[0.02] py-2.5 text-brand hover:border-brand/45"
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              {OPS_COPY.growthDeployFirst}
            </span>
          </ShadButton>
        )}
      </div>
    </div>
  );
}
