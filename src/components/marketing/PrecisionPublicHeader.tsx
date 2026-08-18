import { Link } from "react-router";

import WirelineMark from "../brand/WirelineMark";
import SkipToContentLink from "../layout/SkipToContentLink";

export default function PrecisionPublicHeader() {
  return (
    <header className="wl-public-header fixed inset-x-0 top-0 z-[80] border-b border-border bg-[color:color-mix(in_srgb,var(--wireline-page)_96%,transparent)] backdrop-blur-xl">
      <SkipToContentLink href="#main-content" />
      <div className="wl-measure mx-auto flex h-16 min-w-0 items-center gap-2 px-2.5 sm:gap-5 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex min-w-0 shrink items-center gap-2 rounded-[var(--radius-md)] font-[var(--wireline-font-display)] text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.035em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Wireline home"
        >
          <WirelineMark className="size-8 shrink-0 text-primary" signal />
          <span className="truncate">Wireline</span>
        </Link>

        <nav
          className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-3"
          aria-label="Account"
        >
          <Link
            to="/signin"
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-[var(--radius-md)] px-2 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-3"
          >
            Sign In
          </Link>
          <Link
            to="/signup?plan=personal"
            className="marketing-btn-primary min-h-11 px-4 text-sm font-semibold shrink-0 whitespace-nowrap max-[380px]:px-3"
          >
            Start Free
          </Link>
        </nav>
      </div>
    </header>
  );
}
