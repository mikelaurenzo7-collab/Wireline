import { Link } from "react-router-dom";
import WirelineMark from "../WirelineMark";
import { cn } from "../../lib/utils";

export type PublicNavActive = "signin" | "signup" | "home";

type PublicSiteHeaderProps = {
  className?: string;
  /** Highlight Sign up vs Sign in on auth routes */
  active?: PublicNavActive;
};

export default function PublicSiteHeader({ className, active = "home" }: PublicSiteHeaderProps) {
  return (
    <header
      className={cn(
        "relative z-20 flex shrink-0 items-center justify-between gap-4 px-5 py-4 lg:px-8",
        className,
      )}
    >
      <Link to="/" className="flex items-center gap-3 group min-w-0">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-[1.02]"
          style={{
            background: "#4F1E7B",
            boxShadow: "0 6px 20px -8px rgba(79,30,123,0.45)",
          }}
        >
          <WirelineMark className="w-5 h-5 text-on-brand" strokeWidth={130} />
        </div>
        <div className="min-w-0">
          <span className="brand-wordmark text-2xl leading-none !text-brand !filter-none block truncate">
            WIRELINE
          </span>
          <span className="text-eyebrow hidden sm:block mt-0.5">Voice + email agents</span>
        </div>
      </Link>

      <nav className="flex items-center gap-1 sm:gap-2 shrink-0" aria-label="Site">
        <Link
          to="/pricing"
          className="hidden md:inline-flex px-3 py-2 text-caption font-medium text-ink/75 hover:text-ink rounded-lg hover:bg-black/5 transition-colors"
        >
          Pricing
        </Link>
        <Link
          to="/showcase"
          className="hidden sm:inline-flex px-3 py-2 text-caption font-medium text-ink/75 hover:text-ink rounded-lg hover:bg-black/5 transition-colors"
        >
          Demos
        </Link>
        <Link
          to="/signin"
          className={cn(
            "px-3 py-2 text-caption font-semibold rounded-lg transition-colors",
            active === "signin"
              ? "text-ink bg-black/6"
              : "text-ink/80 hover:text-ink hover:bg-black/5",
          )}
        >
          Sign in
        </Link>
        <Link
          to="/signup"
          className={cn(
            "ml-0.5 inline-flex items-center justify-center px-4 py-2.5 rounded-full text-[13px] font-semibold tracking-wide transition-all",
            active === "signup"
              ? "bg-brand-deep text-on-brand"
              : "bg-brand text-on-brand hover:bg-[#6A25A3] shadow-[0_4px_14px_-4px_rgba(79,30,123,0.5)]",
          )}
        >
          Start trial
        </Link>
      </nav>
    </header>
  );
}
