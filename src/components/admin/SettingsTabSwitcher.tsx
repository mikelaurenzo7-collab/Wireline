import React from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";

type AdminTab =
  | "integrations"
  | "branding"
  | "carrier"
  | "subscription"
  | "team"
  | "flywheel"
  | "activity"
  | "dnc"
  | "audit";

interface TabDef {
  id: AdminTab;
  label: string;
  path: string;
}

const TAB_GROUPS: { tabs: TabDef[] }[] = [
  {
    tabs: [
      { id: "subscription", label: "Billing", path: "/admin?tab=subscription" },
      { id: "team", label: "Team", path: "/admin?tab=team" },
    ],
  },
  { tabs: [{ id: "branding", label: "Branding", path: "/admin?tab=branding" }] },
  { tabs: [{ id: "carrier", label: "Carrier", path: "/admin?tab=carrier" }] },
  { tabs: [{ id: "flywheel", label: "Growth", path: "/admin?tab=flywheel" }] },
  { tabs: [{ id: "integrations", label: "Integrations", path: "/integrations" }] },
  { tabs: [{ id: "activity", label: "Activity", path: "/admin?tab=activity" }] },
  {
    tabs: [
      { id: "dnc", label: "DNC", path: "/dnc" },
      { id: "audit", label: "Audit", path: "/audit" },
    ],
  },
];

export default function SettingsTabSwitcher({
  className,
  density = "default",
}: {
  className?: string;
  density?: "default" | "compact";
}) {
  const location = useLocation();

  const getActiveTab = (): AdminTab => {
    const pathname = location.pathname;
    if (pathname === "/integrations") return "integrations";
    if (pathname === "/dnc") return "dnc";
    if (pathname === "/audit") return "audit";
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get("tab") as AdminTab;
    const validTabs: AdminTab[] = [
      "branding",
      "carrier",
      "subscription",
      "team",
      "flywheel",
      "activity",
    ];
    return validTabs.includes(tab) ? tab : "branding";
  };

  const activeTab = getActiveTab();

  return (
    <div
      className={cn(
        "shrink-0 flex items-center justify-start gap-1 min-w-0 max-w-full overflow-x-auto tab-strip-scroll",
        density === "compact" ? "mb-0" : "mb-2 md:mb-3",
        className,
      )}
      role="tablist"
      aria-label="Settings sub-navigation"
    >
      <div
        className={cn(
          "app-tab-strip wl-subtab-strip flex items-center gap-0.5 wl-panel border border-black/8 w-max min-w-full",
          density === "compact" ? "p-0.5 border-0 bg-transparent shadow-none" : "p-0.5",
        )}
      >
        {TAB_GROUPS.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && (
              <span
                aria-hidden="true"
                className="shrink-0 self-center w-px h-4 bg-black/10 mx-0.5"
              />
            )}
            {group.tabs.map((t) => {
              const active = activeTab === t.id;
              return (
                <Link
                  key={t.id}
                  to={t.path}
                  role="tab"
                  data-testid={`admin-tab-${t.id}`}
                  aria-selected={active}
                  className={cn(
                    "touch-press relative shrink-0 inline-flex items-center gap-1.5 transition-colors uppercase font-semibold whitespace-nowrap rounded-none",
                    density === "compact"
                      ? "min-h-7 px-2 py-0.5 text-[9px] tracking-[0.08em]"
                      : "min-h-9 px-3 py-1.5 text-[10.5px] tracking-[0.12em]",
                    active ? "app-tab-active" : "text-muted hover:text-ink hover:bg-black/4",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="settings-hub-active-pill"
                      aria-hidden="true"
                      className="app-tab-active-bg absolute inset-0 pointer-events-none"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative z-[1]">{t.label}</span>
                </Link>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
