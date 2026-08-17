/**
 * Unmounted leftover marketing block. Talking-head Live Video is retired.
 * If this surface is remounted, it must not sell sessions or a $19 add-on.
 */
import { ArrowRight, Mail, MessageSquareText, PhoneCall } from "lucide-react";
import { Link } from "react-router";

import { liveVideoAddonPitch } from "../../lib/video-presenter/copy";

const CHANNELS = [
  { label: "Voice", icon: PhoneCall },
  { label: "Text", icon: MessageSquareText },
  { label: "Email", icon: Mail },
] as const;

type LiveVideoSpotlightProps = {
  eyebrow: string;
};

export default function LiveVideoSpotlight({ eyebrow }: LiveVideoSpotlightProps) {
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
              {eyebrow}
            </div>

            <h2 className="wl-display-2 mx-auto mt-5 max-w-[24ch] lg:mx-0">
              Your voice agent, on every channel.
            </h2>
            <p className="mx-auto mt-4 max-w-[46ch] text-[15px] leading-[1.7] text-muted-foreground lg:mx-0">
              {liveVideoAddonPitch()} Phone, email, and text use the same Training, operating
              rules, and approved knowledge.
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
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-foreground shadow-sm"
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
        </div>
      </div>
    </section>
  );
}
