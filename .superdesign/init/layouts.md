# Wireline Shared Layouts

Public acquisition routes use MarketingChrome and MarketingPageFrame. Authenticated routes use AppShell with WorkspacePageFrame and its shared chrome. The following are complete source files.

## src/components/layout/AppShell.tsx
- Description: Authenticated application shell. It composes error recovery, skip navigation, route announcements, email verification, and the registered authenticated routes.

~~~tsx
import { useEffect } from "react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "../../contexts/AuthContext";
import { workspacePageTitle } from "../../constants/navigation";
import AppRoutes from "../../routes/AppRoutes";
import TransitionSurface from "../TransitionSurface";
import TrialGateModal from "../TrialGateModal";
import { CommandBar } from "../organisms";

export default function AppShell() {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user) return;
    document.title = `${workspacePageTitle(location.pathname)} - Wireline`;
  }, [loading, location.pathname, user]);

  if (loading) {
    return (
      <TransitionSurface
        eyebrow="Workspace"
        title="Opening your workspace"
        busyLabel="Checking your session"
      />
    );
  }

  if (!user) {
    const redirect = `${location.pathname}${location.search}`;
    return <Navigate to={`/signin?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  // Authenticated: render routes (see AppRoutes.tsx). Post-login destination resolved in
  // AuthPortal/OAuthComplete via resolvePostAuthDestination -> defaults to /overview.
  return (
    <>
      <AppRoutes />
      <CommandBar />
      <TrialGateModal />
    </>
  );
}
~~~

## src/components/layout/WorkspacePageFrame.tsx
- Description: Primary authenticated page frame with title rail, actions, content regions, responsive sizing, and workspace rhythm.

~~~tsx
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";

export type WorkspacePageMode = "standard" | "narrow" | "operate";

type WorkspacePageFrameProps = {
  children: ReactNode;
  className?: string;
  /** Page chrome mode — standard 1080px, narrow 860px, operate full-bleed rail. */
  mode?: WorkspacePageMode;
  /** @deprecated Use mode="narrow" */
  narrow?: boolean;
};

const MODE_MAX_WIDTH: Record<WorkspacePageMode, string> = {
  standard: "max-w-[1080px]",
  narrow: "max-w-[860px]",
  operate: "max-w-none",
};

/** Consistent content rail for authenticated workspace pages. */
export function WorkspacePageFrame({
  children,
  className,
  mode,
  narrow = false,
}: WorkspacePageFrameProps) {
  const resolvedMode: WorkspacePageMode = mode ?? (narrow ? "narrow" : "standard");

  return (
    <div
      data-wireline-page-mode={resolvedMode}
      className={cn(
        "wl-workspace-page mx-auto flex w-full flex-col gap-5 pb-8 sm:gap-6",
        MODE_MAX_WIDTH[resolvedMode],
        resolvedMode === "operate" && "gap-4 px-3 pt-3 sm:px-5 lg:px-6 lg:pt-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

type WorkspacePageIntroProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Start-aligned product header (default) or centered status/empty-state header. */
  align?: "center" | "start";
  /**
   * Drop the visible heading when something else already names the section.
   * `true` hides it at every breakpoint — right when a tab strip below carries
   * the name on mobile too (Settings, Inbox). `"lg"` hides it only at `lg` and
   * up, where the workspace sidebar names the page — right when mobile has no
   * substitute (Connections sits under the dock's "More", with no tab strip,
   * so below `lg` this heading is the page's only on-screen name). Either way
   * the heading stays in the accessibility tree.
   */
  titleHidden?: boolean | "lg";
};

/** Minimal page title for authenticated workspace surfaces. */
export function WorkspacePageIntro({
  title,
  description,
  action,
  align = "start",
  titleHidden = false,
}: WorkspacePageIntroProps) {
  const start = align === "start";

  // Nothing left to show: render the accessible heading alone. `sr-only` is
  // absolutely positioned, so it leaves the frame's flex flow entirely and
  // contributes no gap — a wrapper here would leave a blank band instead.
  // (Only for the fully-hidden variant — the "lg" variant still shows below lg.)
  if (titleHidden === true && !description && !action) {
    return <h1 className="sr-only">{title}</h1>;
  }

  return (
    <header
      data-align={align}
      className={cn(
        "wl-workspace-page-intro flex w-full flex-col gap-3",
        start
          ? "items-start text-left md:flex-row md:items-start md:justify-between md:gap-6"
          : "mx-auto max-w-prose items-center text-center sm:flex-col",
      )}
    >
      <div className={cn("min-w-0", start ? "flex-1" : "w-full")}>
        <h1
          className={cn(
            titleHidden === true ? "sr-only" : "wl-display-3 break-words text-balance uppercase",
            titleHidden === "lg" && "lg:sr-only",
            !titleHidden && !start && "text-center",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "max-w-prose text-pretty text-sm leading-relaxed text-muted-foreground",
              !titleHidden && "mt-2",
              titleHidden === "lg" && "mt-2 lg:mt-0",
              !start && "mx-auto text-center",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div
          className={cn(
            "shrink-0",
            start ? "w-full [&>*]:w-full md:w-auto md:[&>*]:w-auto" : "w-full",
          )}
        >
          {action}
        </div>
      ) : null}
    </header>
  );
}

type WorkspaceOperateIntroProps = {
  title: string;
  tabs?: ReactNode;
  action?: ReactNode;
  /**
   * Drop the visible heading at `lg` and up, where the workspace sidebar already
   * names the selected section — printing "Calls" under a selected "Calls" rail
   * item labels the page twice. The heading stays `sr-only` (kept in the
   * accessibility tree so the page retains a document outline) rather than
   * removed, and it stays visible below `lg`, where the sidebar is hidden and
   * this is the page's only on-screen name.
   */
  titleHidden?: boolean;
};

/** Thin operate-mode title bar (Phone, Insights). */
export function WorkspaceOperateIntro({
  title,
  tabs,
  action,
  titleHidden = false,
}: WorkspaceOperateIntroProps) {
  return (
    <header className="wl-operate-surface shrink-0 border-b border-border/60 pb-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1
            className={cn(
              "wl-display-3 break-words text-balance uppercase",
              titleHidden && "lg:sr-only",
            )}
          >
            {title}
          </h1>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {/* When the heading collapses to sr-only at lg+, pull the tab strip up so
          the operate bar doesn't keep a phantom gap where the title used to sit. */}
      {tabs ? <div className={cn("mt-3", titleHidden && !action && "lg:mt-0")}>{tabs}</div> : null}
    </header>
  );
}
~~~

## src/components/layout/MarketingPageFrame.tsx
- Description: Public page frame with precision header, content landmark, sticky CTA, footer, and cookie consent.

~~~tsx
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import PrecisionPublicHeader from "../marketing/PrecisionPublicHeader";
import MarketingFooter from "../marketing/MarketingFooter";
import MarketingStickyCta from "../marketing/MarketingStickyCta";
import { cn } from "../../lib/utils";

type MarketingSectionLink = {
  id: string;
  label: string;
};

interface MarketingPageFrameProps {
  children: ReactNode;
  /** Fixed viewport (landing-style) vs scrollable long-form */
  scroll?: boolean;
  /** Opt-in mobile bottom conversion bar. Public pages already carry in-flow CTAs. */
  stickyCta?: boolean;
  footer?: boolean;
  className?: string;
  mainClassName?: string;
  sectionLinks?: MarketingSectionLink[];
}

/** Shared shell for public marketing pages — fixed chrome, consistent rhythm, and one footer. */
export default function MarketingPageFrame({
  children,
  scroll = true,
  stickyCta = false,
  footer = true,
  className,
  mainClassName,
  sectionLinks,
}: MarketingPageFrameProps) {
  const location = useLocation();
  const activeSection = location.hash.replace(/^#/, "") || sectionLinks?.[0]?.id;

  return (
    <div
      className={cn(
        "marketing-surface relative flex flex-col bg-background text-foreground",
        scroll ? "min-h-dvh" : "h-dvh max-h-dvh overflow-hidden",
        className,
      )}
    >
      <PrecisionPublicHeader />

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "relative z-10",
          scroll ? "grow" : "min-h-0 flex-1",
          scroll ? "scroll-viewport" : "flex flex-col overflow-hidden",
          stickyCta && scroll && "marketing-has-sticky-cta",
          scroll
            ? "px-4 pb-8 pt-20 sm:px-5 sm:pb-10 sm:pt-24 md:px-8 md:pb-12 md:pt-28 lg:px-12 xl:px-16 2xl:px-20"
            : "px-4 pb-4 pt-16 sm:px-5 lg:px-8 lg:pb-6",
          mainClassName,
        )}
      >
        {sectionLinks && sectionLinks.length > 0 ? (
          <div className="sticky top-16 z-20 -mx-5 mb-6 border-y border-border bg-[color:color-mix(in_srgb,var(--wireline-page)_94%,transparent)] px-5 py-2.5 backdrop-blur-xl md:-mx-8 md:px-8 lg:-mx-12 lg:px-12">
            <nav
              aria-label="On this page"
              className="wl-measure flex items-center gap-2 overflow-x-auto tab-strip-scroll"
            >
              <span className="wl-overline shrink-0">On this page</span>
              {sectionLinks.map((link) => {
                const active = activeSection === link.id;
                return (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    aria-current={active ? "location" : undefined}
                    className={cn(
                      "touch-press shrink-0 rounded-full border px-3 py-1.5 text-[length:var(--wireline-typography-caption-size)] font-medium transition-colors",
                      active
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground",
                    )}
                  >
                    {link.label}
                  </a>
                );
              })}
            </nav>
          </div>
        ) : null}
        <div className={cn(scroll && "wl-measure", "resp-adaptive-grid")}>{children}</div>
      </main>

      {footer ? (
        <MarketingFooter className="relative z-10 shrink-0" aboveStickyCta={stickyCta && scroll} />
      ) : null}
      {stickyCta && scroll ? <MarketingStickyCta /> : null}
    </div>
  );
}
~~~

## src/components/marketing/MarketingChrome.tsx
- Description: Composable marketing shell used when pages own their body but share global header/footer behavior.

~~~tsx
import type { ReactNode } from "react";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import MarketingFooter from "./MarketingFooter";
import MarketingStickyCta from "./MarketingStickyCta";
import { cn } from "../../lib/utils";

type Props = {
  children: ReactNode;
  /** Opt-in mobile bottom conversion bar. In-flow CTAs are the default. */
  stickyCta?: boolean;
  footer?: boolean;
  /** Aurora auth canvas (sign-in, reset password) — matches AuthPortal */
  authCanvas?: boolean;
  className?: string;
};

/**
 * Header + optional footer + optional mobile sticky CTA without the full page frame.
 * Use for legal, support, or nested layouts that bring their own content width.
 */
export default function MarketingChrome({
  children,
  stickyCta = false,
  footer = true,
  authCanvas = false,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "marketing-surface min-h-dvh flex flex-col text-foreground",
        authCanvas ? "auth-portal-canvas" : "bg-card",
        className,
      )}
    >
      <PrecisionPublicHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          /* No nested scroller here: the chrome's root div is the scroll
             container (foundation's `.wl-ui-caps >` rule). A second
             overflow-y-auto viewport squeezed long content (legal pages)
             into the space left over by the always-visible footer. */
          "relative z-10 flex-1 flex flex-col",
          /* PrecisionPublicHeader is fixed h-16 — reserve space so hero copy isn't clipped. */
          !authCanvas && "pt-16 sm:pt-20",
          stickyCta && "marketing-has-sticky-cta",
        )}
      >
        {children}
      </main>
      {footer && <MarketingFooter className="relative z-10 shrink-0" aboveStickyCta={stickyCta} />}
      {stickyCta && <MarketingStickyCta />}
    </div>
  );
}
~~~

## src/components/marketing/PrecisionPublicHeader.tsx
- Description: Responsive public navigation, mobile menu, identity lockup, and acquisition calls to action.

~~~tsx
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { MARKETING_VOICE } from "../../lib/product-copy";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../atoms";
import WirelineMark from "../brand/WirelineMark";
import SkipToContentLink from "../layout/SkipToContentLink";

const links = [
  {
    to: "/solutions/support",
    label: "Solutions",
    active: (path: string) => path.startsWith("/solutions/") || path.startsWith("/for/"),
  },
  { to: "/features", label: "Features", active: (path: string) => path === "/features" },
  { to: "/pricing", label: "Pricing", active: (path: string) => path === "/pricing" },
  { to: "/showcase", label: "Demos", active: (path: string) => path === "/showcase" },
  {
    to: "/trust",
    label: "Trust",
    active: (path: string) =>
      path === "/trust" || path === "/security" || path.startsWith("/trust/"),
  },
] as const;

const mobileControlClassName =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-foreground transition-[background-color,color,transform] hover:bg-secondary hover:text-primary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export default function PrecisionPublicHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <header className="fixed inset-x-0 top-0 z-[80] border-b border-border bg-[color:color-mix(in_srgb,var(--wireline-page)_98%,transparent)] backdrop-blur-xl">
        <SkipToContentLink href="#main-content" />
        <div className="wl-measure relative mx-auto flex h-16 items-center gap-4 px-5 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5 rounded-[var(--radius-md)] font-[var(--wireline-font-display)] text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.035em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Wireline home"
          >
            <WirelineMark className="size-11 shrink-0 text-primary" signal />
            <span>Wireline</span>
          </Link>
          <nav
            className="absolute left-1/2 top-0 hidden h-full -translate-x-1/2 items-center gap-7 lg:flex"
            aria-label="Site"
          >
            {links.map((link) => {
              const active = link.active(location.pathname);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full items-center border-b-2 text-sm font-medium transition-colors ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto hidden items-center gap-5 lg:flex">
            <Link
              to="/signin"
              className="text-sm font-medium text-foreground transition-colors hover:text-primary"
            >
              Sign in
            </Link>
            <Link
              to="/signup?plan=personal"
              className="marketing-btn-primary min-h-10 px-4 text-sm font-semibold"
            >
              Start free
            </Link>
          </div>
          <DialogTrigger asChild>
            <button
              type="button"
              className={`${mobileControlClassName} ml-auto lg:hidden`}
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="wireline-mobile-navigation"
            >
              {open ? <X size={21} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </DialogTrigger>
        </div>
      </header>

      <DialogContent
        id="wireline-mobile-navigation"
        presentation="navigation"
        aria-label="Wireline navigation"
        showClose={false}
        overlayClassName="!top-16 !z-[60] bg-[color:color-mix(in_srgb,var(--wireline-page)_76%,transparent)] backdrop-blur-sm"
      >
        <DialogTitle className="sr-only">Wireline navigation</DialogTitle>
        <DialogDescription className="sr-only">
          Browse Wireline product pages or open your account.
        </DialogDescription>
        <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <p className="wl-overline">Wireline</p>
            <span className="text-right font-[var(--wireline-font-display)] text-sm font-semibold tracking-[-.02em] text-foreground">
              {MARKETING_VOICE.buyingNoun}
            </span>
          </div>
          <nav className="mt-2" aria-label="Mobile site">
            {links.map((link) => {
              const active = link.active(location.pathname);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`group flex min-h-14 items-center justify-between border-b border-border text-[1.0625rem] font-semibold tracking-[-.025em] transition-colors ${active ? "text-primary" : "text-foreground hover:text-primary"}`}
                >
                  {link.label}
                  <span
                    aria-hidden="true"
                    className="text-lg transition-transform group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto grid gap-2 pt-6">
            <Link
              to="/signup?plan=personal"
              onClick={() => setOpen(false)}
              className="marketing-btn-primary min-h-12 text-[length:var(--wireline-typography-body-size)] font-semibold"
            >
              Start free
            </Link>
            <Link
              to="/signin"
              onClick={() => setOpen(false)}
              className="marketing-btn-secondary min-h-12 text-[length:var(--wireline-typography-body-size)] font-semibold"
            >
              Sign in
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
~~~

## src/components/marketing/MarketingFooter.tsx
- Description: Public footer with product, company, legal, and trust navigation.

~~~tsx
import { Link } from "react-router";
import { cn } from "../../lib/utils";
import WirelineMark from "../brand/WirelineMark";

const OPEN_PRIVACY_CHOICES_EVENT = "wireline:open-privacy-choices";

const PRODUCT_LINKS = [
  { to: "/for/personal", label: "Personal" },
  { to: "/solutions/sales", label: "Sales" },
  { to: "/solutions/support", label: "Support" },
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/compare", label: "Compare" },
] as const;

const COMPANY_LINKS = [
  { to: "/about", label: "About" },
  { to: "/blog", label: "Blog" },
  { to: "/contact", label: "Contact" },
  { to: "/changelog", label: "Changelog" },
] as const;

const RESOURCE_LINKS = [
  { to: "/showcase", label: "Demos" },
  { to: "/developers", label: "Developers" },
  { to: "/trust", label: "Trust Center" },
  { to: "/support", label: "Support" },
] as const;

const LEGAL_LINKS = [
  { to: "/status", label: "Status" },
  { to: "/security", label: "Security" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

type Props = {
  compact?: boolean;
  aboveStickyCta?: boolean;
  className?: string;
};

export default function MarketingFooter({
  compact = false,
  aboveStickyCta = false,
  className,
}: Props) {
  return (
    <footer
      className={cn(
        "relative z-10 shrink-0 border-t border-border bg-background",
        compact ? "px-5 py-6" : "px-5 py-10 sm:px-6 sm:py-12 lg:px-8 xl:px-12 2xl:px-16",
        aboveStickyCta && "marketing-footer-above-sticky",
        className,
      )}
    >
      <div className="wl-public-rail">
        <div className="marketing-footer-rail">
          <div className="marketing-footer-brand">
            <Link
              to="/"
              aria-label="Wireline home"
              className="inline-flex items-center gap-2.5 rounded-[var(--radius-md)] font-[var(--wireline-font-display)] text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.035em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <WirelineMark className="size-11 shrink-0 text-primary" signal />
              <span>Wireline</span>
            </Link>
            <p className="mt-3 max-w-sm text-[15px] leading-6 text-muted-foreground">
              Voice agents that handle the conversation and finish the work.
            </p>
          </div>

          <div className="marketing-footer-navs grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-12">
            <nav
              aria-label="Product"
              className="marketing-footer-nav flex flex-col items-start gap-0.5"
            >
              <p className="wl-overline mb-1">Product</p>
              {PRODUCT_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex min-h-10 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <nav
              aria-label="Company"
              className="marketing-footer-nav flex flex-col items-start gap-0.5"
            >
              <p className="wl-overline mb-1">Company</p>
              {COMPANY_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex min-h-10 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <nav
              aria-label="Resources"
              className="marketing-footer-nav flex flex-col items-start gap-0.5"
            >
              <p className="wl-overline mb-1">Resources</p>
              {RESOURCE_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex min-h-10 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="marketing-footer-legal mt-9 flex flex-col gap-3 border-t border-border pt-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>&copy; {new Date().getFullYear()} Wireline</span>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="inline-flex min-h-10 items-center transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              data-compact="true"
              className="inline-flex min-h-10 items-center transition-colors hover:text-foreground"
              onClick={() => window.dispatchEvent(new Event(OPEN_PRIVACY_CHOICES_EVENT))}
            >
              Privacy choices
            </button>
          </nav>
        </div>
      </div>
    </footer>
  );
}
~~~
