import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "../../lib/utils";

type HeroAction = {
  label: string;
  to: string;
  tone?: "primary" | "secondary";
};

type HeroMetric = {
  label: string;
  value: string;
};

type MarketingHeroProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  primaryAction?: HeroAction;
  secondaryAction?: HeroAction;
  proof?: readonly string[];
  metrics?: readonly HeroMetric[];
  /**
   * Kept for call-site compatibility. Generic marketing previews are intentionally
   * no longer rendered; only a genuinely functional custom visual earns hero space.
   */
  visualEyebrow?: string;
  visualTitle?: ReactNode;
  visualBody?: ReactNode;
  visualItems?: readonly string[];
  visual?: ReactNode;
  className?: string;
  compact?: boolean;
};

function isExternalHref(href: string): boolean {
  return /^(tel:|mailto:|https?:)/.test(href);
}

export default function MarketingHero({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryAction,
  proof = [],
  metrics = [],
  visual,
  className,
  compact = false,
}: MarketingHeroProps) {
  const actions = [primaryAction, secondaryAction].filter(Boolean) as HeroAction[];
  const isBrandSpine = typeof title === "string" && title.includes("→");

  return (
    <section
      className={cn(
        "marketing-hero border-b border-border px-5 text-center sm:px-8 lg:px-10",
        compact ? "py-12 sm:py-16 lg:py-20" : "py-16 sm:py-24 lg:py-28",
        className,
      )}
    >
      <div className="wl-public-rail mx-auto">
        <div className="mx-auto flex max-w-[72rem] flex-col items-center">
          {eyebrow ? (
            <div className="inline-flex max-w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 shadow-[var(--wireline-elevation-sm)]">
              <span className="marketing-live-dot h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden="true" />
              <span className="wl-eyebrow wl-eyebrow--wired min-w-0 truncate text-muted-foreground">
                {eyebrow}
              </span>
            </div>
          ) : null}

          <h1
            className={cn(
              "marketing-hero__title mx-auto max-w-[20ch] text-balance font-[var(--wireline-font-family-display)] text-[clamp(2.75rem,7vw,6.2rem)] font-bold leading-[.94] tracking-[-.055em] text-foreground",
              eyebrow ? "mt-6" : "mt-0",
              isBrandSpine &&
                "max-w-none whitespace-nowrap text-[clamp(2.05rem,8.25vw,6rem)] tracking-[-.065em]",
            )}
          >
            {title}
          </h1>

          <p className="marketing-hero__description mx-auto mt-6 max-w-[48rem] text-pretty text-[1.0625rem] leading-8 text-muted-foreground sm:text-[1.2rem] sm:leading-[1.62]">
            {description}
          </p>

          {actions.length ? (
            <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
              {actions.map((action) => {
                const primary = action.tone !== "secondary";
                const actionClassName = cn(
                  primary ? "marketing-btn-primary" : "marketing-btn-secondary",
                  "min-h-12 w-full justify-center px-6 text-[15px] font-semibold sm:w-auto",
                );
                const children = (
                  <>
                    {action.label}
                    {primary ? <ArrowRight size={16} aria-hidden="true" /> : null}
                  </>
                );

                return isExternalHref(action.to) ? (
                  <a
                    key={`${action.to}-${action.label}`}
                    href={action.to}
                    className={actionClassName}
                  >
                    {children}
                  </a>
                ) : (
                  <Link
                    key={`${action.to}-${action.label}`}
                    to={action.to}
                    className={actionClassName}
                  >
                    {children}
                  </Link>
                );
              })}
            </div>
          ) : null}

          {proof.length ? (
            <ul
              className="mt-7 flex flex-wrap items-center justify-center gap-2.5"
              aria-label="Wireline proof points"
            >
              {proof.map((item) => (
                <li
                  key={item}
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-muted-foreground"
                >
                  <span
                    className="marketing-proof-chip grid h-[18px] w-[18px] place-items-center"
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {visual || metrics.length ? (
          <div
            className="wl-paper relative mx-auto mt-12 w-full max-w-[72rem] overflow-hidden rounded-[22px] p-5 text-center sm:p-7 lg:p-8"
            aria-label="Wireline interactive preview"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-70"
              aria-hidden="true"
              style={{
                background:
                  "radial-gradient(circle at 50% 0%, var(--wireline-color-glow-primary), transparent 52%)",
              }}
            />
            <div className="relative mx-auto max-w-4xl">
              {visual}
              {metrics.length ? (
                <div className="mx-auto mt-7 grid max-w-3xl gap-3 sm:grid-cols-3">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="rounded-[14px] border border-border bg-card/70 p-4 text-center">
                      <p className="font-[var(--wireline-font-family-display)] text-3xl font-bold leading-none tracking-[-.04em] text-foreground">
                        {metric.value}
                      </p>
                      <p className="mt-2 text-[12px] font-semibold uppercase tracking-[.12em] text-muted-foreground">
                        {metric.label}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
