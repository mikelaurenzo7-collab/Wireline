import { Link } from "react-router";

import {
  MOBILE_MORE_GROUPS,
  isNavActive,
  type ShellNavItem,
} from "../../constants/navigation";
import { navIcon } from "../nav-icons";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/shadcn/Sheet";

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
  const Icon = navIcon(item.icon);

  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      data-wireline-nav-href={item.href}
      data-wireline-nav-active={active ? "true" : undefined}
      className="wl-shell-more-link min-h-[48px] wl-focus-ring-halo"
    >
      <span className="wl-shell-more-icon">
        <Icon size={18} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
      </span>
      <span className="wl-shell-more-copy">
        <span className="wl-shell-more-label">{item.label}</span>
      </span>
    </Link>
  );
}

export default function MobileNavMoreSheet({
  open,
  onOpenChange,
  pathname,
}: MobileNavMoreSheetProps) {
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="wl-shell-more-sheet px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="wl-shell-more-title text-left">More</SheetTitle>
          <SheetDescription className="sr-only">More workspace destinations.</SheetDescription>
        </SheetHeader>

        <nav aria-label="More workspace destinations" className="wl-shell-more-groups">
          {MOBILE_MORE_GROUPS.map((group) => (
            <section key={group.label} aria-labelledby={`mobile-more-${group.label}`}>
              <h2 id={`mobile-more-${group.label}`} className="wl-shell-more-group-label">
                {group.label}
              </h2>
              <div className="wl-shell-more-group-items">
                {group.items.map((item) => (
                  <MoreNavLink
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    onNavigate={close}
                  />
                ))}
              </div>
            </section>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
