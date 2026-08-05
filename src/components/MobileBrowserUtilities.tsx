import { Link, useLocation } from "react-router";
import { Cable, CreditCard, MonitorDown, Settings, UsersRound } from "lucide-react";
import { PAGE_TITLES } from "../constants/navigation";

const mobileUtilityLinks = [
  { href: "/settings", label: PAGE_TITLES["/settings"], detail: "Account", icon: Settings },
  { href: "/settings/billing", label: "Billing", detail: "Usage + balance", icon: CreditCard },
  {
    href: "/connections",
    label: PAGE_TITLES["/connections"],
    detail: "Connected tools",
    icon: Cable,
  },
  { href: "/apps", label: PAGE_TITLES["/apps"], detail: "Surfaces", icon: MonitorDown },
  { href: "/settings/team", label: "Team", detail: "Access", icon: UsersRound },
] as const;

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/settings") return pathname.startsWith("/settings");
  return pathname.startsWith(`${href}/`);
}

function hidesOwnControls(pathname: string) {
  return (
    pathname === "/studio" || pathname.startsWith("/studio/") || pathname.startsWith("/settings")
  );
}

export default function MobileBrowserUtilities() {
  const location = useLocation();

  if (hidesOwnControls(location.pathname)) return null;

  return (
    <details
      key={location.pathname}
      className="fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.5rem)] right-4 z-[70] hidden sm:block lg:hidden"
    >
      <summary
        aria-label="Open workspace controls"
        className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-border bg-background text-foreground shadow-[var(--wireline-elevation-md)] marker:hidden transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
      >
        <Settings size={18} aria-hidden="true" />
      </summary>
      <div className="fixed inset-x-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+8.25rem)] max-h-[min(24rem,calc(100dvh-11rem))] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-background p-2 normal-case tracking-normal text-foreground shadow-[0_24px_60px_-30px_rgba(17,17,17,0.55),var(--wireline-elevation-md)] sm:left-auto sm:right-4 sm:w-[21rem]">
        <div className="border-b border-border/70 px-3 py-2 text-left">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Controls
          </p>
        </div>
        <nav className="mt-1 grid gap-1" aria-label="Mobile browser controls">
          {mobileUtilityLinks.map(({ href, label, detail, icon: Icon }) => {
            const active = isActive(location.pathname, href);
            return (
              <Link
                key={href}
                to={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  active ? "bg-muted text-foreground" : "hover:bg-muted text-foreground"
                }`}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-card text-foreground">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                  <span className="truncate font-semibold leading-none text-foreground">
                    {label}
                  </span>
                  <span className="shrink-0 text-[11px] font-medium leading-none text-muted-foreground">
                    {detail}
                  </span>
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </details>
  );
}
