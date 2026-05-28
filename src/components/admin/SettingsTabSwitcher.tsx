import React from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";

type AdminTab =
  | "branding"
  | "carrier"
  | "subscription"
  | "team"
  | "flywheel"
  | "system"
  | "activity"
  | "dnc"
  | "audit";

interface TabDef {
  id: AdminTab;
  label: string;
  path: string;
}

// Settings is now strictly admin/config concerns. Voice library + pronunciation
// moved to /train (they're agent training inputs, not tenant admin).
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
  {
    tabs: [
      { id: "system", label: "System", path: "/admin?tab=system" },
      { id: "activity", label: "Activity", path: "/admin?tab=activity" },
    ],
  },
  {
    tabs: [
      { id: "dnc", label: "DNC", path: "/dnc" },
      { id: "audit", label: "Audit", path: "/audit" },
    ],
  },
];

export default function SettingsTabSwitcher() {
  const location = useLocation();

  const getActiveTab = (): AdminTab => {
    const pathname = location.pathname;
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
      "system",
      "activity",
    ];
    return validTabs.includes(tab) ? tab : "branding";
  };

  const activeTab = getActiveTab();

  return (
    <div className="shrink-0 mb-0 md:mb-3 flex items-center gap-1 overflow-x-auto scrollbar-hide">
      <div
        className="flex gap-0.5 p-0.5 rounded-xl glass border border-black/8 overflow-x-auto snap-x snap-mandatory scrollbar-hide max-w-full"
        role="tablist"
        aria-label="Settings sub-navigation"
      >
        {TAB_GROUPS.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && (
              <span aria-hidden="true" className="shrink-0 self-center w-px h-4 bg-black/12 mx-1" />
            )}
            {group.tabs.map((t) => (
              <Link
                key={t.id}
                to={t.path}
                role="tab"
                aria-selected={activeTab === t.id}
                className={cn(
                  "shrink-0 snap-start min-h-10 px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-[0.1em] transition-colors whitespace-nowrap font-medium",
                  activeTab === t.id
                    ? "bg-brand/20 text-brand font-semibold"
                    : "text-muted hover:text-ink hover:bg-black/5",
                )}
                style={
                  activeTab === t.id
                    ? {
                        background: "rgba(79, 30, 123, 0.15)",
                        boxShadow: "0 0 0 1px rgba(79, 30, 123, 0.1) inset",
                      }
                    : undefined
                }
              >
                {t.label}
              </Link>
            ))}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
