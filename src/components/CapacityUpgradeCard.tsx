import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { authFetch } from "../lib/api";
import type { ClientPlan } from "../types/api-billing";
import ChannelPlanPicker, { channelSelectionKey, hasChannelPlanDetails } from "./ChannelPlanPicker";
import { ShadButton } from "./ui/shadcn/ShadButton";

type CapacityStatus = {
  current_plan_id: string;
  interval: "month" | "year";
  effective_at: string | null;
  eligible_plan_ids: string[];
  pending: {
    plan_id: string;
    effective_at: string;
    status?: "scheduled" | "incomplete";
  } | null;
  available: boolean;
};

const endpoint = "/api/billing/capacity-upgrade";
function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function readStatus(value: unknown, currentPlanId: string): CapacityStatus {
  const data = value as Partial<CapacityStatus> | null;
  if (
    !data ||
    data.current_plan_id !== currentPlanId ||
    !["month", "year"].includes(data.interval ?? "") ||
    typeof data.available !== "boolean" ||
    !Array.isArray(data.eligible_plan_ids) ||
    !data.eligible_plan_ids.every((id) => typeof id === "string") ||
    (data.effective_at !== null && !isDate(data.effective_at)) ||
    (data.pending !== null &&
      (!data.pending ||
        typeof data.pending.plan_id !== "string" ||
        !isDate(data.pending.effective_at) ||
        (data.pending.status !== undefined &&
          !["scheduled", "incomplete"].includes(data.pending.status))))
  )
    throw new Error("Capacity details could not be confirmed. Refresh billing and try again.");
  return data as CapacityStatus;
}

function dateLabel(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The owner key discards financial choices and late receipts when accounts change. */
export default function CapacityUpgradeCard(props: {
  currentPlanId: string;
  plans: ClientPlan[];
  refreshKey?: number;
  onRefreshBilling?: () => void;
}) {
  const { user } = useAuth();
  return user ? <CapacityUpgradeContent key={user.id} {...props} /> : null;
}

export function CapacityUpgradeContent({
  currentPlanId,
  plans,
  refreshKey = 0,
  onRefreshBilling,
}: {
  currentPlanId: string;
  plans: ClientPlan[];
  refreshKey?: number;
  onRefreshBilling?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CapacityStatus | null>(null);
  const [selectedId, setSelectedId] = useState(currentPlanId);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const savePending = useRef(false);

  useEffect(() => {
    const request = ++generation.current;
    const controller = new AbortController();
    setLoading(true);
    setSaving(false);
    savePending.current = false;
    setError(null);
    void (async () => {
      try {
        const response = await authFetch(endpoint, { signal: controller.signal });
        const data = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(data?.error || "Capacity details are unavailable. Try again.");
        const confirmed = readStatus(data, currentPlanId);
        if (request !== generation.current) return;
        setStatus(confirmed);
        setSelectedId(confirmed.pending?.plan_id ?? currentPlanId);
      } catch (cause) {
        if (request === generation.current && !controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Capacity details are unavailable. Try again.",
          );
      } finally {
        if (request === generation.current) setLoading(false);
      }
    })();
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [currentPlanId, refreshKey, retry]);

  const current = plans.filter(hasChannelPlanDetails).find((plan) => plan.id === currentPlanId);
  const eligible = plans
    .filter(hasChannelPlanDetails)
    .filter(
      (plan) =>
        current &&
        channelSelectionKey(plan.channels) === channelSelectionKey(current.channels) &&
        (plan.id === currentPlanId || status?.eligible_plan_ids.includes(plan.id)),
    );
  const canSchedule = Boolean(
    !loading &&
    !saving &&
    !error &&
    status?.available &&
    !status.pending &&
    status.current_plan_id === currentPlanId &&
    status.eligible_plan_ids.includes(selectedId) &&
    eligible.some((plan) => plan.id === selectedId),
  );

  async function schedule() {
    if (!canSchedule || !status || savePending.current) return;
    savePending.current = true;
    const request = generation.current;
    setSaving(true);
    setError(null);
    try {
      const response = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: selectedId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(data?.error || "The change could not be confirmed. Refresh and try again.");
      if (data?.status !== "scheduled" || data.plan_id !== selectedId || !isDate(data.effective_at))
        throw new Error("The change could not be confirmed. Refresh before trying again.");
      if (request !== generation.current) return;
      setStatus({ ...status, pending: { plan_id: data.plan_id, effective_at: data.effective_at } });
    } catch (cause) {
      if (request === generation.current)
        setError(
          cause instanceof Error ? cause.message : "The change could not be confirmed. Try again.",
        );
    } finally {
      if (request === generation.current) {
        savePending.current = false;
        setSaving(false);
      }
    }
  }

  async function removeScheduledChange() {
    if (!status?.pending || savePending.current || loading) return;
    savePending.current = true;
    const request = generation.current;
    setSaving(true);
    setError(null);
    try {
      const response = await authFetch(endpoint, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.status !== "removed")
        throw new Error(data?.error || "Removal could not be confirmed. Refresh and try again.");
      if (request !== generation.current) return;
      setStatus({ ...status, pending: null });
      setSelectedId(currentPlanId);
      setRetry((value) => value + 1);
    } catch (cause) {
      if (request === generation.current)
        setError(
          cause instanceof Error ? cause.message : "Removal could not be confirmed. Try again.",
        );
    } finally {
      if (request === generation.current) {
        savePending.current = false;
        setSaving(false);
      }
    }
  }

  if (!current) return null;
  const pendingPlan = status?.pending && plans.find((plan) => plan.id === status.pending?.plan_id);
  const pendingIncomplete = status?.pending?.status === "incomplete";
  return (
    <section
      className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-label="Plan capacity"
    >
      <ShadButton
        type="button"
        variant="outline"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        disabled={saving}
      >
        {open
          ? "Hide Capacity Options"
          : status?.pending
            ? pendingIncomplete
              ? "Review Capacity Change"
              : "Scheduled Capacity Change"
            : "Increase Capacity"}
      </ShadButton>
      {open ? (
        <div className="mt-4 space-y-3">
          {loading ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking capacity options…
            </p>
          ) : null}
          {error ? (
            <div role="alert" className="space-y-2 text-sm">
              <p>{error}</p>
              <ShadButton
                type="button"
                variant="outline"
                onClick={() => {
                  onRefreshBilling?.();
                  setRetry((value) => value + 1);
                }}
                disabled={loading || saving}
              >
                Refresh Options
              </ShadButton>
            </div>
          ) : null}
          {status?.pending ? (
            <div className="space-y-3">
              <p role="status" className="text-sm">
                {pendingIncomplete ? (
                  "Capacity change wasn’t confirmed. Remove it, then try again."
                ) : (
                  <>
                    {pendingPlan?.name ?? "Your capacity increase"} is scheduled for{" "}
                    {dateLabel(status.pending.effective_at)}, after successful renewal payment. Your
                    current capacity stays available until then.
                  </>
                )}
              </p>
              <ShadButton
                type="button"
                variant="outline"
                disabled={loading || saving}
                onClick={() => void removeScheduledChange()}
              >
                {saving
                  ? "Removing…"
                  : pendingIncomplete
                    ? "Remove Unconfirmed Change"
                    : "Remove Scheduled Change"}
              </ShadButton>
              <p className="text-sm text-muted-foreground">
                To cancel your subscription, remove this change first, then use Manage Billing.
              </p>
            </div>
          ) : status?.available && eligible.length > 1 ? (
            <>
              <ChannelPlanPicker
                id="capacity-upgrade"
                plans={eligible}
                selectedPlanId={selectedId}
                onSelectPlan={setSelectedId}
                interval={status.interval}
                lockChannels
                disabled={loading || saving || !!error}
                renderAction={() => (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {status.effective_at
                        ? `Starts ${dateLabel(status.effective_at)}, after successful renewal payment.`
                        : "Starts after your next successful renewal payment."}{" "}
                      Your channels and current capacity stay the same until then. Top-ups are
                      available now.
                    </p>
                    <ShadButton
                      type="button"
                      className="w-full"
                      disabled={!canSchedule}
                      onClick={() => void schedule()}
                    >
                      {saving ? "Scheduling…" : "Schedule Capacity Increase"}
                    </ShadButton>
                  </div>
                )}
              />
            </>
          ) : status && !loading && !error ? (
            <p role="status" className="text-sm text-muted-foreground">
              No capacity increase is available for this subscription.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
