import { Link, useLocation } from "react-router-dom";

const settingsTabs = [
  { href: "/settings", label: "Account" },
  { href: "/settings/billing", label: "Billing" },
  { href: "/settings/phone", label: "Phone" },
  { href: "/settings/team", label: "Team" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/settings") return pathname === "/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SettingsTabs() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Settings sections"
      className="mb-5 flex min-h-[40px] w-full items-center gap-2 overflow-x-auto border-b border-border/70 pb-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {settingsTabs.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            to={tab.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-lg px-3.5 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 ${
              active
                ? "bg-primary text-primary-foreground shadow-[var(--wireline-elevation-sm)]"
                : "text-foreground hover:bg-muted"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
