import {
  ArrowRight,
  Mail,
  MessageSquareText,
  PhoneCall,
  UserRound,
  Video,
} from "lucide-react";
import { Link } from "react-router";
import {
  LIVE_VIDEO_ADDON_PRICE_USD,
  LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY,
  LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
} from "../../lib/video-presenter/live-video-policy";

const CHANNELS = [
  { label: "Voice", icon: PhoneCall },
  { label: "Text", icon: MessageSquareText },
  { label: "Email", icon: Mail },
  { label: "Live Video", icon: Video },
] as const;

const PRESENTER_SLOTS = ["01", "02", "03"] as const;
const LIVE_VIDEO_FACTS = [
  `${LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY} min/month`,
  `${LIVE_VIDEO_SESSION_RESERVATION_MINUTES} min/session max`,
  `$${LIVE_VIDEO_ADDON_PRICE_USD}/mo add-on`,
] as const;

type LiveVideoSpotlightProps = {
  bridgeLabel: string;
};

export default function LiveVideoSpotlight({
  bridgeLabel,
}: LiveVideoSpotlightProps) {
  return (
    <section className="wl-public-section overflow-hidden border-b border-border">
      <div className="wl-public-rail">
        <div className="grid items-center gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
          <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span className="relative flex size-2" aria-hidden="true">
                <span className="absolute inline-flex size-full rounded-full bg-primary/30 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              {bridgeLabel}
            </div>

            <h2 className="wl-display-2 mx-auto mt-5 max-w-[14ch] lg:mx-0">
              One agent. Now on screen.
            </h2>
            <p className="mx-auto mt-4 max-w-[48ch] text-[15px] leading-[1.7] text-muted-foreground lg:mx-0">
              {`Call. Text. Email. Add Live Video to a paid business agent for $${LIVE_VIDEO_ADDON_PRICE_USD}/mo.`}
            </p>

            <div
              className="mt-7 flex flex-wrap justify-center gap-2 lg:justify-start"
              role="list"
              aria-label="Agent channels"
            >
              {CHANNELS.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  role="listitem"
                  className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground shadow-sm"
                >
                  <Icon className="size-3.5 text-primary" aria-hidden="true" />
                  {label}
                </span>
              ))}
            </div>

            <Link
              to="/signup?plan=starter"
              className="marketing-btn-primary mx-auto mt-7 min-h-11 justify-center px-5 text-sm font-semibold sm:w-fit lg:mx-0"
            >
              Build a business agent
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>

          <div className="relative mx-auto w-full max-w-[700px]">
            <div
              className="pointer-events-none absolute -inset-16 opacity-70"
              aria-hidden="true"
              style={{
                background:
                  "radial-gradient(circle at 52% 48%, var(--wireline-color-glow-primary), transparent 58%)",
              }}
            />

            <div className="relative overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_24px_70px_rgba(0,0,0,0.14)]">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Video className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-foreground">Live presenter</p>
                    <p className="text-[10px] text-muted-foreground">Voice synchronized</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground">
                  <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                  Live
                </span>
              </div>

              <div className="relative grid min-h-[330px] place-items-center overflow-hidden bg-[var(--wireline-color-surface-subtle)] px-5 py-8 sm:min-h-[390px] sm:px-8">
                <div
                  className="pointer-events-none absolute inset-0 opacity-80"
                  aria-hidden="true"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 38%, var(--wireline-color-glow-primary), transparent 42%), linear-gradient(180deg, transparent, var(--wireline-color-surface-default))",
                  }}
                />

                <div className="relative flex w-full max-w-[390px] flex-col items-center">
                  <div className="relative grid aspect-[4/5] w-[170px] place-items-center overflow-hidden rounded-[28px] border border-border/80 bg-background shadow-xl sm:w-[210px]">
                    <div
                      className="absolute inset-x-5 top-5 h-24 rounded-full bg-primary/10 blur-2xl"
                      aria-hidden="true"
                    />
                    <div className="relative flex flex-col items-center" aria-hidden="true">
                      <span className="grid size-24 place-items-center rounded-full border border-border bg-muted sm:size-28">
                        <UserRound className="size-14 text-muted-foreground/60 sm:size-16" />
                      </span>
                      <span className="-mt-2 h-20 w-32 rounded-t-[48px] bg-muted sm:w-36" />
                    </div>
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-2 py-1 text-[9px] font-semibold text-foreground shadow-sm backdrop-blur">
                      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                      ON SCREEN
                    </span>
                  </div>

                  <div
                    className="mt-5 flex items-end justify-center gap-2"
                    role="list"
                    aria-label="Presenter catalog preview"
                  >
                    {PRESENTER_SLOTS.map((slot, index) => (
                      <div
                        key={slot}
                        role="listitem"
                        className={`relative grid size-12 place-items-center overflow-hidden rounded-xl border bg-background shadow-sm sm:size-14 ${
                          index === 0
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-border"
                        }`}
                      >
                        <UserRound
                          className={`size-6 ${
                            index === 0 ? "text-primary" : "text-muted-foreground/50"
                          }`}
                          aria-hidden="true"
                        />
                        <span className="sr-only">Presenter option {slot}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-px border-t border-border bg-border sm:grid-cols-3">
                {LIVE_VIDEO_FACTS.map((item) => (
                  <div
                    key={item}
                    className="bg-card px-4 py-3 text-center text-[11px] font-medium text-muted-foreground"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
