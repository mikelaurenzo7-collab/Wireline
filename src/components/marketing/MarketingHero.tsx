import { Fragment, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { MARKETING_VOICE } from "../../lib/product-copy";
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
  const isHomeHero = typeof title === "string" && title === MARKETING_VOICE.headline;

  return (
    <section
      className={cn(
        "marketing-hero border-b border-border px-5 sm:px-8 lg:px-10",
        compact
          ? "py-10 sm:py-12 lg:py-16"
          : isHomeHero
            ? "py-14 sm:py-20 lg:py-24"
            : "py-12 sm:py-16 lg:py-20",
        isHomeHero && "wireline-home-hero",
        className,
      )}
    >
      <div className="wl-public-rail">
        <div
          className={cn(
            "marketing-hero__content mx-auto flex max-w-[70rem] flex-col items-center text-center",
            isHomeHero && "wireline-home-hero__content",
          )}
        >
          {eyebrow ? (
            <div className="inline-flex max-w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 shadow-[var(--wireline-elevation-sm)]">
              <span className="marketing-live-dot h-1.5 w-1.5 rounded-full" aria-hidden="true" />
              <span className="wl-eyebrow wl-eyebrow--wired min-w-0 truncate text-muted-foreground">
                {eyebrow}
              </span>
            </div>
          ) : null}

          {isHomeHero ? (
            <div
              aria-label="Wire to Work to Win"
              className="inline-flex max-w-full flex-nowrap items-center justify-center gap-[clamp(.4rem,2.5vw,.75rem)] whitespace-nowrap rounded-full border border-border bg-card px-[clamp(.8rem,4vw,1.25rem)] py-2 font-[var(--wireline-font-family-mono)] text-[clamp(.7rem,3.3vw,.82rem)] font-semibold uppercase tracking-[.12em] text-muted-foreground shadow-[var(--wireline-elevation-sm)]"
            >
              {MARKETING_VOICE.spine.map((item, index) => (
                <Fragment key={item}>
                  <span>{item}</span>
                  {index < MARKETING_VOICE.spine.length - 1 ? (
                    <ArrowRight className="size-[1em] shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </Fragment>
              ))}
            </div>
          ) : null}

          <h1
            aria-label={isHomeHero && typeof title === "string" ? title : undefined}
            className={cn(
              "marketing-hero__title mx-auto max-w-[22ch] text-balance font-[var(--wireline-font-family-display)] text-[clamp(2.1rem,4.3vw,3.5rem)] font-bold uppercase leading-[0.98] tracking-[-.005em] text-foreground",
              eyebrow || isHomeHero ? "mt-6" : "mt-0",
              isHomeHero &&
                "max-w-[19ch] text-[clamp(2.45rem,5.5vw,4.65rem)] leading-[0.94] tracking-[-.012em]",
            )}
          >
            {title}
          </h1>

          <p
            className={cn(
              "marketing-hero__description mx-auto mt-6 max-w-[52rem] text-pretty text-[1.0625rem] leading-8 text-muted-foreground sm:text-[1.2rem] sm:leading-[1.62]",
              isHomeHero &&
                "max-w-[48rem] font-[var(--wireline-font-family-display)] text-[clamp(1.05rem,2.1vw,1.4rem)] font-semibold leading-snug tracking-[-.015em]",
            )}
          >
            {description}
          </p>

          {actions.length ? (
            <div className="marketing-hero__actions mt-9">
              {actions.map((action) => {
                const primary = action.tone !== "secondary";
                const actionClassName = cn(
                  primary ? "marketing-btn-primary" : "marketing-btn-secondary",
                  "min-h-12 justify-center px-6 text-[15px] font-semibold sm:w-auto",
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
              className="mt-7 grid w-full max-w-[22rem] grid-cols-2 gap-2 sm:flex sm:max-w-3xl sm:flex-wrap sm:justify-center"
              aria-label="Wireline proof points"
            >
              {proof.map((item, index) => (
                <li
                  key={item}
                  className={cn(
                    "inline-flex min-h-8 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-2.5 text-center text-[12px] font-medium text-muted-foreground sm:px-3.5 sm:text-[13px]",
                    proof.length % 2 === 1 && index === proof.length - 1
                      ? "col-span-2 sm:col-span-1"
                      : undefined,
                  )}
                >
                  <span className="h-1 w-1 rounded-full bg-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {visual ? (
          <div className="marketing-hero__experience wl-paper mx-auto mt-12 max-w-4xl overflow-hidden rounded-[22px] p-5 text-center sm:p-7 lg:p-9">
            {visual}
            {metrics.length ? (
              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                {metrics.map((metric) => (
                  <div
                    key={metric.label}
                    className="rounded-[14px] border border-border bg-card/70 p-4 text-center"
                  >
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
        ) : metrics.length ? (
          <div className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-3">
            {metrics.map((metric) => (
              <div key={metric.label} className="wl-paper rounded-[14px] p-5 text-center">
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
    </section>
  );
}
