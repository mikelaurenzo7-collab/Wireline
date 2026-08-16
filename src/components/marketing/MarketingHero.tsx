import { useEffect, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";

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
  title: ReactNode;
  primaryAction?: HeroAction;
  secondaryAction?: HeroAction;
  metrics?: readonly HeroMetric[];
  visual?: ReactNode;
  className?: string;
};

function isExternalHref(href: string): boolean {
  // In-page hash targets ("#demo-lines") must render as native anchors too:
  // React Router's <Link> uses pushState, which does not trigger the browser's
  // hash-scroll, so a hero CTA pointing at a "#section" silently does nothing.
  return /^(tel:|mailto:|https?:|#)/.test(href);
}

export default function MarketingHero({
  title,
  primaryAction,
  secondaryAction,
  metrics = [],
  visual,
  className,
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
        // No bottom border and no vertical padding of its own: the hero is now
        // composed inside a `.marketing-section`, which owns the section rhythm
        // and draws the boundary. Carrying both drew a rule straight through
        // the middle of the opening screen, cutting the headline away from the
        // demo that proves it.
        "marketing-hero px-5 sm:px-8 lg:px-10",
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
          <h1
            aria-label={isHomeHero && typeof title === "string" ? title : undefined}
            className={cn(
              "marketing-hero__title mx-auto max-w-[28ch] text-balance font-[var(--wireline-font-family-display)] text-[clamp(2.1rem,4.3vw,3.5rem)] font-semibold leading-[1.02] tracking-[-.035em] text-foreground",
              "mt-0",
              isHomeHero &&
                "max-w-[19ch] text-[clamp(2.2rem,3.9vw,3.6rem)] leading-[1] tracking-[-.04em]",
            )}
          >
            {title}
          </h1>

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
