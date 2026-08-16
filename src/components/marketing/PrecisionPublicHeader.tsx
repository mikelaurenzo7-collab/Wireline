import { Link } from "react-router";

import WirelineMark from "../brand/WirelineMark";
import SkipToContentLink from "../layout/SkipToContentLink";

export default function PrecisionPublicHeader() {
  return (
    <header className="wl-public-header fixed inset-x-0 top-0 z-[80] border-b border-border bg-[color:color-mix(in_srgb,var(--wireline-page)_96%,transparent)] backdrop-blur-xl">
      <SkipToContentLink href="#main-content" />
      <div className="wl-measure mx-auto flex h-16 items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] font-[var(--wireline-font-display)] text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.035em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Wireline home"
        >
          <WirelineMark className="size-8 shrink-0 text-primary" signal />
          <span>Wireline</span>
        </Link>

        <nav className="ml-auto flex items-center gap-2 sm:gap-4" aria-label="Account">
          <Link
            to="/signin"
            className="inline-flex min-h-10 items-center rounded-[var(--radius-md)] px-2 text-xs font-semibold text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-3 sm:text-sm"
          >
            Sign In
          </Link>
          <Link
            to="/signup?plan=personal"
            className="marketing-btn-primary min-h-10 px-3 text-xs font-semibold sm:min-h-11 sm:px-4 sm:text-sm"
          >
            Start Free
          </Link>
        </nav>
      </div>
    </header>
  );
}
