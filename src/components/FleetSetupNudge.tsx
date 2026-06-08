/**
 * Compact fleet-setup banner for Chat (Director) — not the full Live Ops wizard.
 * Fast Start remains one click away; dismiss persists in localStorage.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Rocket, X, ArrowRight } from "lucide-react";
import { authFetch } from "../lib/api";
import {
  fetchFleetSetupProgress,
  fleetSetupCompletedCount,
  FLEET_SETUP_STEP_COUNT,
  isFleetSetupComplete,
  type FleetSetupProgress,
} from "../lib/fleet-setup-progress";
import { WL_OPS_CLASSES, OPS_COPY } from "../lib/wireline-ops-design";
import { isPostSignupFlowActive, isFreshSignupSession } from "../lib/post-signup-onboarding";
import FastStartWizard from "./FastStartWizard";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { cn } from "../lib/utils";

const DISMISS_KEY = "wireline_onboarding_dismissed";

export default function FleetSetupNudge({ className }: { className?: string }) {
  const [progress, setProgress] = useState<FleetSetupProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [showFastStart, setShowFastStart] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "true") setDismissed(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, billing] = await Promise.all([
          fetchFleetSetupProgress(),
          authFetch("/api/billing/status")
            .then((r) => r.json())
            .then(
              (d) =>
                (d.subscription?.plan_id ||
                  d.subscription?.plan ||
                  d.signup_intent?.plan_id ||
                  null) as string | null,
            )
            .catch(() => null),
        ]);
        if (!cancelled) {
          setProgress(p);
          setPlanId(billing);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  };

  if (dismissed || loading || !progress) return null;
  if (isPostSignupFlowActive() || isFreshSignupSession()) return null;

  const isWhiteGlove = planId === "business" || planId === "enterprise";
  if (isWhiteGlove || isFleetSetupComplete(progress)) return null;

  const done = fleetSetupCompletedCount(progress);
  const pct = Math.round((done / FLEET_SETUP_STEP_COUNT) * 100);

  return (
    <>
      <div
        className={cn(
          WL_OPS_CLASSES.setupNudge,
          "flex flex-col sm:flex-row sm:items-center gap-3",
          className,
        )}
      >
        <div className="flex-1 min-w-0 pl-1">
          <p className="wl-label text-brand mb-1">{OPS_COPY.setupEyebrow}</p>
          <p className="text-xs text-ink/75 leading-relaxed">
            {OPS_COPY.setupBody(done, FLEET_SETUP_STEP_COUNT)} {OPS_COPY.setupHint}
          </p>
          <div
            className="mt-2 h-1 w-full max-w-[12rem] rounded-full bg-black/10 overflow-hidden"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Fleet setup progress"
          >
            <div
              className="h-full rounded-full bg-brand motion-safe:transition-[width] duration-500"
              data-pct={`${pct}%`}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pl-2">
          <ShadButton
            type="button"
            variant="editorial"
            size="sm"
            disableAnimations
            onClick={() => setShowFastStart(true)}
            className="touch-press rounded-full wl-label"
          >
            <Rocket className="w-3.5 h-3.5" />
            Fast Start
          </ShadButton>
          <Link
            to="/agents"
            className="touch-press inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border wl-label text-ink/70 hover:text-ink hover:border-brand/30 transition-colors min-h-[36px]"
          >
            Agents
            <ArrowRight className="w-3 h-3" />
          </Link>
          <ShadButton
            type="button"
            variant="ghost"
            size="icon"
            disableAnimations
            onClick={dismiss}
            aria-label="Dismiss setup reminder"
            className="touch-press h-9 w-9 rounded-full text-muted hover:text-ink"
          >
            <X className="w-3.5 h-3.5" />
          </ShadButton>
        </div>
      </div>

      {showFastStart && (
        <FastStartWizard
          isOpen={showFastStart}
          onClose={() => setShowFastStart(false)}
          onComplete={() => {
            setShowFastStart(false);
            void fetchFleetSetupProgress().then(setProgress);
          }}
        />
      )}
    </>
  );
}
