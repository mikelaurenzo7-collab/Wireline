import { Link, useLocation } from "react-router-dom";
import { Cable, CreditCard, MonitorDown, Settings, UsersRound } from "lucide-react";

const mobileUtilityLinks = [
  { href: "/settings", label: "Settings", detail: "Account", icon: Settings },
  { href: "/settings/billing", label: "Billing", detail: "Usage + balance", icon: CreditCard },
  { href: "/actions", label: "Integrations", detail: "Connected tools", icon: Cable },
  { href: "/settings/apps", label: "Apps", detail: "Mobile + browser", icon: MonitorDown },
  { href: "/settings/team", label: "Team", detail: "Access", icon: UsersRound },
] as const;

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/settings") return pathname.startsWith("/settings");
  return pathname.startsWith(`${href}/`);
}

export default function MobileBrowserUtilities() {
  const location = useLocation();
  return (
    <details className="fixed right-3 top-3 z-50 lg:hidden">
      <summary
        aria-label="Open workspace controls"
        className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-border bg-background/95 text-foreground shadow-[var(--wireline-elevation-sm)] backdrop-blur-xl marker:hidden [&::-webkit-details-marker]:hidden"
      >
        <Settings size={18} aria-hidden="true" />
      </summary>
      <div className="absolute right-0 mt-2 w-[min(19rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-background p-2 shadow-[var(--wireline-elevation-md)]">
        <div className="px-3 py-2">
          <p className="wl-overline">Controls</p>
          <p className="mt-1 text-sm text-muted-foreground">Settings, usage, integrations.</p>
        </div>
        <nav className="grid gap-1" aria-label="Mobile browser controls">
          {mobileUtilityLinks.map(({ href, label, detail, icon: Icon }) => (
            <Link
              key={href}
              to={href}
              aria-current={isActive(location.pathname, href) ? "page" : undefined}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-muted"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground"><Icon size={15} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">{detail}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </details>
  );
}
