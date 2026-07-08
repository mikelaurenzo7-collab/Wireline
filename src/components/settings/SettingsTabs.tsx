import { useLocation } from "react-router-dom";

import { WorkspaceTabStrip } from "../layout/WorkspaceTabStrip";

const settingsTabs = [
  { id: "account", href: "/settings", label: "Account" },
  { id: "billing", href: "/settings/billing", label: "Billing" },
  { id: "phone", href: "/settings/phone", label: "Phone" },
  { id: "team", href: "/settings/team", label: "Team" },
  { id: "customization", href: "/settings/customization", label: "Branding" },
  { id: "compliance", href: "/settings/compliance", label: "Compliance" },
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
      wrap
      className="mb-7 border-b border-border/70 pb-3"
    />
  );
}
