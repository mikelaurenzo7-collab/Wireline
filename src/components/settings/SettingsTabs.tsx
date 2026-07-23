import { useLocation } from "react-router-dom";

import { WorkspaceTabStrip } from "../layout/WorkspaceTabStrip";

const settingsTabs = [
  { id: "account", href: "/settings", label: "Account", shortLabel: "Acct" },
  { id: "billing", href: "/settings/billing", label: "Billing", shortLabel: "Bill" },
  { id: "phone", href: "/settings/phone", label: "Phone", shortLabel: "Phone" },
  { id: "team", href: "/settings/team", label: "Team", shortLabel: "Team" },
  {
    id: "customization",
    href: "/settings/customization",
    label: "Appearance",
    shortLabel: "Look",
    ariaLabel: "Appearance and brand",
  },
  { id: "apps", href: "/settings/apps", label: "Apps", shortLabel: "Apps" },
  {
    id: "compliance",
    href: "/settings/compliance",
    label: "Compliance",
    shortLabel: "Rules",
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
