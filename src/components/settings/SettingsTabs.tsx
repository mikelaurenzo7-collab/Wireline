import { useLocation } from "react-router";

import { WorkspaceTabStrip } from "../layout/WorkspaceTabStrip";

const settingsTabs = [
  { id: "account", href: "/settings", label: "Account" },
  { id: "billing", href: "/settings/billing", label: "Billing" },
  { id: "phone", href: "/settings/phone", label: "Phone" },
  { id: "team", href: "/settings/team", label: "Team" },
  {
    id: "customization",
    href: "/settings/customization",
    label: "Appearance",
    ariaLabel: "Appearance and brand",
  },
  { id: "apps", href: "/settings/apps", label: "Apps" },
  {
    id: "compliance",
    href: "/settings/compliance",
    label: "Compliance",
    ariaLabel: "Compliance",
  },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SettingsTabs() {
  const { pathname } = useLocation();
  const activeTab = settingsTabs.find((tab) => isActive(pathname, tab.href))?.id ?? "account";

  return (
    <WorkspaceTabStrip
      ariaLabel="Settings sections"
      tabs={settingsTabs}
      activeId={activeTab}
      density="compact"
      align="start"
      className="mb-5 border-b border-border/70 pb-3 sm:mb-7"
    />
  );
}
