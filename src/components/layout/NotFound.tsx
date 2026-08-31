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
      <div className="min-h-[80svh] flex flex-col items-center justify-center gap-8 text-center px-6 py-12 relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center -z-10"
        >
          <div
            aria-hidden="true"
            className="w-[55vw] h-[55vw] max-w-[700px] max-h-[700px] sm:opacity-40 opacity-25 rounded-full blur-3xl wl-not-found-glow"
          />
        </div>

        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="wl-display-mark text-brand-display text-[6rem] sm:text-[8rem] lg:text-[10rem] xl:text-[12rem] leading-none select-none"
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
            Page not found
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
            isPublic ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"
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
                to="/showcase"
                icon={Phone}
                label="Browser demo"
                hint="Hear a Bot"
                accent={BRAND.colors.primary}
              />
              <NotFoundCard
                to="/pricing"
                icon={Compass}
                label="Pricing"
                hint="Plans + Runtime Balance"
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
              Sign in →
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
      <div className="text-left flex-1 min-w-0">
        <p className="wl-eyebrow wl-eyebrow--no-rule !text-[0.625rem]">{hint}</p>
        <p className="text-[length:var(--wireline-typography-caption-size)] text-foreground font-medium">
          {label}
        </p>
      </div>
    </Link>
  );
}
