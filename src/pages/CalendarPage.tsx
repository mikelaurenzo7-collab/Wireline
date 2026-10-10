import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { authFetch } from "../lib/api";
import {
  initialCalendarSettings,
  readCalendarSettings,
  type CalendarSettings,
} from "../lib/calendar-settings-client";
import { Button, Skeleton } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import AppointmentsPanel from "../components/AppointmentsPanel";
import CalendarAvailabilityPanel from "../components/CalendarAvailabilityPanel";
import WorkspaceControlBand from "../components/layout/WorkspaceControlBand";
import { WorkspaceOperateIntro, WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";

const CALENDAR_TABS = [
  { id: "agenda", label: "Calendar" },
  { id: "availability", label: "Availability" },
];

export default function CalendarPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "availability" ? "availability" : "agenda";
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void (async () => {
      try {
        const response = await authFetch("/api/calendar/settings", { signal: controller.signal });
        const body = (await response.json().catch(() => null)) as {
          settings?: unknown;
          configured?: boolean;
          error?: string;
        } | null;
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(body?.error || "Could not load availability.");
        const parsed = readCalendarSettings(body?.settings);
        if (!parsed || typeof body?.configured !== "boolean")
          throw new Error("Could not load availability. Try again.");
        setConfigured(body.configured);
        setSettings(initialCalendarSettings(parsed, body.configured));
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Could not load availability.");
      }
    })();
    return () => controller.abort();
  }, [reload]);

  const selectTab = useCallback(
    (id: string) =>
      setParams(
        (current) => {
          if (id === "agenda") current.delete("tab");
          else current.set("tab", "availability");
          return current;
        },
        { replace: true },
      ),
    [setParams],
  );

  return (
    <WorkspaceShell contentClassName="pt-0 pb-0" fullBleed>
      <WorkspacePageFrame
        mode="operate"
        className="flex min-h-0 flex-1 flex-col gap-0 pb-5 lg:pb-4"
      >
        <WorkspaceOperateIntro
          title="Calendar"
          titleHidden
          tabs={
            <WorkspaceControlBand
              embedded
              ariaLabel="Calendar controls"
              primary={
                <WorkspaceTabStrip
                  tabs={CALENDAR_TABS}
                  activeId={tab}
                  onSelect={selectTab}
                  ariaLabel="Calendar sections"
                  density="compact"
                  align="start"
                  mobileSelect
                  className="mb-0 min-w-0 flex-1 border-b-0 pb-0"
                />
              }
            />
          }
        />
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
          data-visual-qa-state={tab}
        >
          {tab === "agenda" ? (
            <AppointmentsPanel
              calendarConfigured={configured}
              onConfigure={() => selectTab("availability")}
            />
          ) : null}
          {/* Keep the form's pending save and retry state alive across tab changes. */}
          <div hidden={tab !== "availability"} className="min-w-0">
            {error ? (
              <StatusNotice
                tone="warning"
                title="Availability Unavailable"
                className="m-4"
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setReload((value) => value + 1)}
                  >
                    Retry
                  </Button>
                }
              >
                {error}
              </StatusNotice>
            ) : settings && configured !== null ? (
              <CalendarAvailabilityPanel
                settings={settings}
                configured={configured}
                onChange={setSettings}
                onSaved={(confirmed) => {
                  setSettings(confirmed);
                  setConfigured(true);
                }}
              />
            ) : (
              <div
                className="mx-auto w-full max-w-2xl space-y-3 p-4"
                aria-busy="true"
                aria-label="Loading availability"
              >
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            )}
          </div>
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
