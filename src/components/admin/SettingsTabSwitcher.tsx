import React, { useCallback, useRef, type KeyboardEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
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
  | "dnc";

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
  { tabs: [{ id: "integrations", label: "Integrations", path: "/connections" }] },
  { tabs: [{ id: "activity", label: "Activity", path: "/admin?tab=activity" }] },
  { tabs: [{ id: "dnc", label: "Compliance", path: "/settings/compliance" }] },
];

export default function SettingsTabSwitcher({
  className,
  density = "default",
}: {
  className?: string;
  density?: "default" | "compact";
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const stripRef = useRef<HTMLDivElement>(null);

  // Flat tab order (ignoring visual group dividers) for arrow-key roving.
  const flatTabs = TAB_GROUPS.flatMap((g) => g.tabs);

  const getActiveTab = (): AdminTab => {
    const pathname = location.pathname;
    if (pathname === "/connections" || pathname === "/actions") return "integrations";
    if (pathname === "/settings/compliance" || pathname.startsWith("/settings/compliance")) {
      return "dnc";
    }
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = flatTabs.findIndex((t) => t.id === activeTab);
      if (currentIndex < 0) return;
      let nextIndex: number | null = null;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (currentIndex + 1) % flatTabs.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (currentIndex - 1 + flatTabs.length) % flatTabs.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = flatTabs.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      const next = flatTabs[nextIndex];
      if (!next) return;
      navigate(next.path);
      stripRef.current
        ?.querySelector<HTMLAnchorElement>(`[data-testid="admin-tab-${next.id}"]`)
        ?.focus();
    },
    [flatTabs, activeTab, navigate],
  );

  return (
    <div
      ref={stripRef}
      className={cn(
        "shrink-0 flex items-center justify-start gap-1 min-w-0 max-w-full overflow-x-auto tab-strip-scroll max-lg:tab-strip-scroll--fade",
        density === "compact" ? "mb-0" : "mb-2 md:mb-3",
        className,
      )}
      role="tablist"
      aria-label="Settings sub-navigation"
      onKeyDown={handleKeyDown}
    >
      <div
        className={cn(
          "app-tab-strip flex items-center gap-0.5 wl-panel border border-white/8 w-max min-w-full",
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
                  tabIndex={active ? 0 : -1}
                  className={cn(
                    "touch-press relative shrink-0 inline-flex items-center gap-1.5 transition-colors uppercase font-semibold whitespace-nowrap rounded-none",
                    density === "compact"
                      ? "min-h-7 px-2 py-0.5 wl-label tracking-[0.08em]"
                      : "min-h-9 px-3 py-1.5 text-[length:var(--wireline-typography-overline-size)] tracking-[0.12em]",
                    active ? "app-tab-active" : "text-muted hover:text-foreground hover:bg-black/4",
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
