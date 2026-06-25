import { type ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bot,
  Cable,
  Database,
  Inbox,
  LayoutDashboard,
  Menu,
  PenLine,
  Search,
  Settings,
  X,
} from "lucide-react";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./atoms";
import WirelineMark from "./brand/WirelineMark";

const primaryNavigation = [
  { href: "/overview", label: "Home", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/studio", label: "Build", icon: PenLine },
  { href: "/knowledge", label: "Know", icon: Database },
  { href: "/actions", label: "Wire", icon: Cable },
  { href: "/inbox", label: "Inbox", icon: Inbox },
] as const;

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
  mobile = false,
}: {
  href: string;
  label: string;
  icon: typeof Bot;
  active: boolean;
  onNavigate: () => void;
  mobile?: boolean;
}) {
  return (
    <Link
      to={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      onClick={onNavigate}
      className={
        mobile
          ? "wl-stitch-sidebar-link gap-3 px-3 py-2.5"
          : "wl-stitch-sidebar-link mx-auto grid size-11 place-items-center rounded-xl p-0"
      }
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
      <span className={mobile ? "truncate normal-case tracking-normal" : "sr-only"}>{label}</span>
    </Link>
  );
}

function WorkspaceNavigationContent({
  pathname,
  onNavigate,
  mobile = false,
}: {
  pathname: string;
  onNavigate: () => void;
  mobile?: boolean;
}) {
  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === "/overview") return false;
    return pathname.startsWith(`${href}/`);
  };

  return (
    <div
      className={
        mobile
          ? "flex min-h-full flex-col px-3 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          : "flex min-h-full flex-col items-center px-2 py-5 pb-5"
      }
    >
      <div className={mobile ? "flex shrink-0 items-center justify-between px-2" : "flex shrink-0 items-center justify-center"}>
        <Link
          to="/overview"
          onClick={onNavigate}
          className="grid size-11 place-items-center rounded-xl text-primary transition-colors hover:bg-muted focus-visible:outline-none"
          aria-label="Wireline home"
          title="Wireline"
        >
          <WirelineMark className="h-6 w-6 shrink-0" />
          <span className={mobile ? "sr-only" : "sr-only"}>Wireline</span>
        </Link>
        {mobile ? (
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="Close navigation">
              <X size={18} aria-hidden="true" />
            </Button>
          </DialogClose>
        ) : null}
      </div>

      <nav className={mobile ? "mt-7 flex flex-col gap-1" : "mt-8 flex flex-col items-center gap-2"} aria-label="Workspace">
        {primaryNavigation.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} onNavigate={onNavigate} mobile={mobile} />
        ))}
      </nav>

      <nav className={mobile ? "mt-auto border-t border-border px-1 pt-4" : "mt-auto flex justify-center pt-4"} aria-label="Account">
        <NavItem
          href="/settings"
          label="Settings"
          icon={Settings}
          active={isActive("/settings") || pathname.startsWith("/admin")}
          onNavigate={onNavigate}
          mobile={mobile}
        />
      </nav>
    </div>
  );
}

export default function WorkspaceShell({
  title,
  eyebrow,
  action,
  children,
  contentClassName = "py-6",
}: {
  title: string;
  eyebrow: string;
  action?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const location = useLocation();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const isStudioRoute = location.pathname === "/studio" || location.pathname.startsWith("/studio/");
  const closeMobileNavigation = () => setMobileNavigationOpen(false);

  useEffect(() => {
    closeMobileNavigation();
  }, [location.pathname]);

  function openCommandPalette() {
    window.dispatchEvent(new Event("wireline:open-command-bar"));
  }

  return (
    <Dialog open={mobileNavigationOpen} onOpenChange={setMobileNavigationOpen}>
      <div className="wl-workspace-shell h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground">
        <a className="wl-skip-link" href="#workspace-main">
          Skip to content
        </a>
        <div className="grid h-full min-h-0 w-full overflow-hidden lg:grid-cols-[72px_minmax(0,1fr)]">
          <aside
            aria-label="Workspace navigation"
            className="wl-stitch-sidebar wl-workspace-sidebar sticky top-0 hidden h-[100dvh] w-[72px] shrink-0 flex-col lg:flex"
          >
            <WorkspaceNavigationContent pathname={location.pathname} onNavigate={() => undefined} />
          </aside>

          <main
            id="workspace-main"
            data-wireline-route={location.pathname}
            className="wl-workspace-main flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-4 pb-4 sm:px-6 sm:pb-5 lg:px-8 lg:pb-6 xl:px-10"
          >
            <header className="wl-workspace-header flex min-h-[64px] shrink-0 flex-row items-center justify-between gap-3 border-b border-border py-3 sm:gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Open navigation"
                    aria-controls="wireline-workspace-navigation"
                    className="lg:hidden"
                  >
                    <Menu size={18} aria-hidden="true" />
                  </Button>
                </DialogTrigger>
                <div className="min-w-0">
                  {eyebrow ? <p className="wl-overline">{eyebrow}</p> : null}
                  <h1 className="wl-app-page-title mt-1 truncate">{title}</h1>
                </div>
              </div>
              <div className="wl-workspace-header-actions flex min-w-0 shrink-0 flex-nowrap items-center gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Command"
                  title="Command"
                  onClick={openCommandPalette}
                  className="hidden size-9 min-h-9 min-w-9 text-muted-foreground hover:text-foreground sm:inline-flex"
                >
                  <Search aria-hidden="true" className="size-4" />
                </Button>
                {action ? <div className="wl-workspace-header-primary-action">{action}</div> : null}
              </div>
            </header>
            <div
              className={`wl-workspace-content min-h-0 flex-1 overflow-y-auto overscroll-contain ${
                isStudioRoute ? "overflow-hidden" : ""
              } ${contentClassName}`}
            >
              <div className="wl-workspace-content-inner mx-auto flex min-h-full w-full max-w-[1480px] flex-col">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>

      <DialogContent
        id="wireline-workspace-navigation"
        presentation="sidebar"
        showClose={false}
        aria-label="Workspace navigation"
        overlayClassName="bg-[rgba(11,28,48,0.34)] lg:hidden"
        className="lg:hidden"
      >
        <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
        <DialogDescription className="sr-only">Move through Wireline.</DialogDescription>
        <WorkspaceNavigationContent pathname={location.pathname} onNavigate={closeMobileNavigation} mobile />
      </DialogContent>
    </Dialog>
  );
}
