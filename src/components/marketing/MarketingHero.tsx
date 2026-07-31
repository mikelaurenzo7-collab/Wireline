import { Fragment, useEffect, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { emitProductEvent, emitProductEventOnce } from "../../lib/product-event-client";
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
  // In-page hash targets ("#demo-lines") must render as native anchors too:
  // React Router's <Link> uses pushState, which does not trigger the browser's
  // hash-scroll, so a hero CTA pointing at a "#section" silently does nothing.
  return /^(tel:|mailto:|https?:|#)/.test(href);
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

  useEffect(() => {
    if (!isHomeHero) return;
    emitProductEventOnce({
      event: "landing_viewed",
      surface: "marketing_web",
      metadata: { path: window.location.pathname || "/", scope: "home_hero" },
    });
  }, [isHomeHero]);

  const trackPrimaryCta = (label: string, to: string) => {
    emitProductEvent({
      event: "landing_primary_cta_clicked",
      surface: "marketing_web",
      metadata: { label, to, source: "marketing_hero" },
    });
  };

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
      <div className="wl-public-rail min-w-0 max-w-full">
        <div
          className={cn(
            "marketing-hero__content mx-auto flex w-full min-w-0 max-w-[70rem] flex-col items-center text-center",
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
              aria-label={MARKETING_VOICE.spine.join(", ")}
              className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-[clamp(.4rem,2.5vw,.75rem)] gap-y-1 rounded-2xl border border-border bg-card px-[clamp(.8rem,4vw,1.25rem)] py-2 font-[var(--wireline-font-family-mono)] text-[clamp(.75rem,3.3vw,.875rem)] font-semibold tracking-[.04em] text-muted-foreground shadow-[var(--wireline-elevation-sm)]"
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
              "marketing-hero__title mx-auto max-w-[28ch] text-balance font-[var(--wireline-font-family-display)] text-[clamp(2.1rem,4.3vw,3.5rem)] font-semibold leading-[1.02] tracking-[-.035em] text-foreground",
              eyebrow || isHomeHero ? "mt-6" : "mt-0",
              isHomeHero &&
                "max-w-[19ch] text-[clamp(2.45rem,5vw,4.75rem)] leading-[0.99] tracking-[-.04em]",
            )}
          >
            {title}
          </h1>

          <p
            className={cn(
              "marketing-hero__description mx-auto mt-6 max-w-[46rem] text-pretty font-[var(--wireline-font-family-body)] text-[1.0625rem] font-normal leading-8 text-muted-foreground sm:text-[1.1875rem] sm:leading-[1.62]",
              isHomeHero && "max-w-[42rem] text-[clamp(1.0625rem,1.8vw,1.25rem)]",
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
                    onClick={primary ? () => trackPrimaryCta(action.label, action.to) : undefined}
                  >
                    {children}
                  </a>
                ) : (
                  <Link
                    key={`${action.to}-${action.label}`}
                    to={action.to}
                    className={actionClassName}
                    onClick={primary ? () => trackPrimaryCta(action.label, action.to) : undefined}
                  >
                    {children}
                  </Link>
                );
              })}
            </div>
          ) : null}

          {proof.length ? (
            <ul
              className="mt-7 grid w-full max-w-[24rem] grid-cols-2 gap-2 sm:flex sm:max-w-3xl sm:flex-wrap sm:justify-center"
              aria-label="Wireline capabilities"
            >
              {proof.map((item, index) => (
                <li
                  key={item}
                  className={cn(
                    "inline-flex min-h-9 min-w-0 items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-center text-[13px] font-medium leading-tight text-muted-foreground sm:whitespace-nowrap sm:px-4 sm:text-sm",
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
                    className="rounded-[var(--wireline-radius-lg)] border border-border bg-card/70 p-4 text-center"
                  >
                    <p className="font-[var(--wireline-font-family-display)] text-3xl font-semibold leading-none tracking-[-.035em] text-foreground">
                      {metric.value}
                    </p>
                    <p className="mt-2 text-[13px] font-semibold text-muted-foreground">
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
              <div
                key={metric.label}
                className="wl-paper rounded-[var(--wireline-radius-lg)] p-5 text-center"
              >
                <p className="font-[var(--wireline-font-family-display)] text-3xl font-semibold leading-none tracking-[-.035em] text-foreground">
                  {metric.value}
                </p>
                <p className="mt-2 text-[13px] font-semibold text-muted-foreground">
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
