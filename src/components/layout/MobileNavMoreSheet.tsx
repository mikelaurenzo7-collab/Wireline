import { Link } from "react-router-dom";

import { MOBILE_MORE_NAV, isNavActive, type ShellNavItem } from "../../constants/navigation";
import { useAccount } from "../../contexts/AccountContext";
import { isRouteAvailableForAccount } from "../../lib/account-type";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/shadcn/Sheet";

type MobileNavMoreSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
};

function MoreNavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: ShellNavItem;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isNavActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-wireline-nav-href={item.href}
      className={`flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors wl-focus-ring-halo ${
        active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
      }`}
    >
      <Icon size={18} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

export default function MobileNavMoreSheet({
  open,
  onOpenChange,
  pathname,
}: MobileNavMoreSheetProps) {
  const { accountType } = useAccount();
  const close = () => onOpenChange(false);
  const items = MOBILE_MORE_NAV.filter((item) =>
    isRouteAvailableForAccount(accountType, item.href),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="wl-display-3 text-left text-lg">More</SheetTitle>
        </SheetHeader>
        <nav aria-label="More workspace destinations" className="mt-4 grid gap-1">
          {items.map((item) => (
            <MoreNavLink key={item.href} item={item} pathname={pathname} onNavigate={close} />
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
