import React from "react";
import { Link, useLocation } from "react-router";
import { MotionConfig, motion } from "motion/react";
import {
  Compass,
  Home,
  LayoutGrid,
  MessageSquare,
  Phone,
  Settings,
  ChevronRight,
} from "lucide-react";
import { BRAND } from "../../constants/brand-colors";

/**
 * NotFound — context-aware 404. Detects whether the visitor is signed-in
 * (App.tsx renders this through AppShell with TopBar) or public (App.tsx
 * checks /not-found path explicitly so an unauth user hitting a typo URL
 * doesn't get bounced into the sign-in form).
 *
 * The `mode` prop forces a specific render for the public route; the
 * default behaviour is to detect signed-in via the absence of `mode`.
 */
export default function NotFound({ mode }: { mode?: "public" | "auth" } = {}) {
  const location = useLocation();
  const isPublic = mode === "public";

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative flex min-h-[80svh] flex-col items-center justify-center gap-6 px-6 py-8 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center -z-10"
        >
          <div
            aria-hidden="true"
            className="wl-not-found-glow h-[42vw] w-[42vw] max-h-[420px] max-w-[420px] rounded-full opacity-25 blur-3xl sm:opacity-35"
          />
        </div>

        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="wl-display-mark text-brand-display select-none text-[4.25rem] leading-none sm:text-[5.5rem] lg:text-[6.75rem]"
        >
          404
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="space-y-3 max-w-md"
        >
          <p className="wl-eyebrow">Error 404</p>
          <h1 className="wl-display-mark text-2xl md:text-3xl text-foreground leading-tight">
            Page Not Found
          </h1>
          <p className="text-caption leading-relaxed max-w-md">
            {location.pathname && location.pathname !== "/" && (
              <span className="mb-1.5 block">
                We couldn't find{" "}
                <code className="wl-code wl-code--path">
                  {location.pathname.length > 32
                    ? location.pathname.slice(0, 32) + "…"
                    : location.pathname}
                </code>
              </span>
            )}
            {isPublic ? null : (
              <>
                The page may have moved.{" "}
                <span className="hidden sm:inline">
                  Use the search bar to jump anywhere, or pick
                </span>
                <span className="sm:hidden">Pick</span> a starting point below.
              </>
            )}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.55 }}
          className={`grid grid-cols-1 gap-3 w-full max-w-3xl ${
            isPublic ? "sm:grid-cols-3" : "sm:grid-cols-2"
          }`}
        >
          {isPublic ? (
            <>
              <NotFoundCard
                to="/"
                icon={Home}
                label="Home"
                hint="Back to landing"
                accent={BRAND.colors.primary}
              />
              <NotFoundCard
                to="/features"
                icon={LayoutGrid}
                label="Features"
                hint="See how BotBound works"
                accent={BRAND.colors.primary}
              />
              <NotFoundCard
                to="/pricing"
                icon={Compass}
                label="Pricing"
                hint="Email from $9 · Calls from $19"
                accent={BRAND.colors.primary}
              />
            </>
          ) : (
            <>
              <NotFoundCard
                to="/studio"
                icon={LayoutGrid}
                label="Bot Studio"
                hint="Create, run & approve"
                accent={BRAND.colors.primary}
              />
              <NotFoundCard
                to="/phone"
                icon={Phone}
                label="Calls"
                hint="Calls, campaigns, logs"
                accent={BRAND.colors.primary}
              />
              <NotFoundCard
                to="/inbox"
                icon={MessageSquare}
                label="Inbox"
                hint="Conversations"
                accent={BRAND.colors.primary}
              />
              <NotFoundCard
                to="/settings"
                icon={Settings}
                label="Settings"
                hint="Account and workspace"
                accent={BRAND.colors.primary}
              />
            </>
          )}
        </motion.div>

        {isPublic && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="wl-label-muted text-muted/80"
          >
            Already have an account?{" "}
            <Link to="/signin" className="text-brand hover:opacity-80 transition-opacity">
              Sign In →
            </Link>
          </motion.p>
        )}
      </div>
    </MotionConfig>
  );
}

function NotFoundCard({
  to,
  icon: Icon,
  label,
  hint,
  accent,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  hint: string;
  accent: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex items-center gap-3 p-4 rounded-md wl-paper wl-press wl-focus-ring-halo"
      data-accent={accent}
    >
      <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0 border border-white/8 wl-accent-icon-chip">
        <Icon className="w-4 h-4" strokeWidth={2.2} />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-[length:var(--wireline-typography-caption-size)] text-muted-foreground">
          {hint}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-foreground/65 group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}
