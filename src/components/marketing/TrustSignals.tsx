import { motion } from "motion/react";
import {
  Lock,
  HeartPulse,
  CreditCard,
  Globe2,
  ServerCog,
  PhoneCall,
  Stethoscope,
  Scale,
  Home,
  Sparkles,
  Wrench,
  UtensilsCrossed,
  Briefcase,
  Headset,
  Megaphone,
  UserRoundCheck,
} from "lucide-react";

const AUDIENCES = [
  { icon: UserRoundCheck, label: "Personal" },
  { icon: Home, label: "Home Services" },
  { icon: Stethoscope, label: "Medical" },
  { icon: Scale, label: "Legal" },
  { icon: Briefcase, label: "Real Estate" },
  { icon: Sparkles, label: "Personal Care" },
  { icon: Wrench, label: "Trades" },
  { icon: UtensilsCrossed, label: "Restaurants" },
  { icon: Megaphone, label: "Sales Teams" },
  { icon: Headset, label: "Support Queues" },
  { icon: PhoneCall, label: "Call Centers" },
  { icon: Globe2, label: "Agencies" },
];

const BADGES = [
  {
    icon: Lock,
    label: "TLS 1.3",
    detail: "Traffic encrypted in transit",
    state: "live" as const,
  },
  {
    icon: ServerCog,
    label: "SOC 2 Type II",
    detail: "Controls implemented · audit target Q4",
    state: "progress" as const,
  },
  {
    icon: HeartPulse,
    label: "HIPAA",
    detail: "Healthcare-ready mode · Enterprise BAA path",
    state: "progress" as const,
  },
  {
    icon: CreditCard,
    label: "PCI DSS",
    detail: "Stripe-handled payment flow",
    state: "ready" as const,
  },
  {
    icon: Globe2,
    label: "GDPR",
    detail: "Right-to-erasure workflows",
    state: "ready" as const,
  },
];

const STATE_TONES = {
  live: {
    pill: "wl-status-success border",
    dot: "dot-online",
    label: "Live",
  },
  ready: {
    pill: "bg-primary/8 text-primary border-primary/20",
    dot: "bg-primary",
    label: "Ready",
  },
  progress: {
    pill: "bg-primary/5 text-primary/80 border-primary/15",
    dot: "bg-primary/60",
    label: "In progress",
  },
} as const;

export default function TrustSignals() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8"
      aria-labelledby="trust-heading"
      data-testid="trust-signals"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="hero-accent-line bg-primary" />
        <h2
          id="trust-heading"
          className="text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.5em] text-muted/70 font-semibold"
        >
          Built for teams that can't afford to miss the conversation
        </h2>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2 mb-4">
        {AUDIENCES.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="group flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-md border border-border bg-card/80 py-2.5 px-1 transition-all hover:border-primary/20 hover:bg-card hover:-translate-y-0.5"
            title={label}
          >
            <Icon
              className="w-3.5 h-3.5 text-primary group-hover:scale-110 transition-transform"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span className="text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.18em] text-muted/70 text-center leading-tight">
              {label}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {BADGES.map(({ icon: Icon, label, detail, state }) => {
          const tone = STATE_TONES[state];
          return (
            <div
              key={label}
              className="rounded-md border border-border bg-card/60 p-2.5 transition-all hover:bg-card hover:border-primary/10"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <Icon className="w-3.5 h-3.5 text-foreground/70" strokeWidth={1.75} />
                <span
                  className={`text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] font-semibold px-1.5 py-0.5 rounded-full border leading-none ${tone.pill}`}
                >
                  <span
                    className={`inline-block w-1 h-1 rounded-full mr-1 align-middle ${tone.dot}`}
                  />
                  {tone.label}
                </span>
              </div>
              <p className="text-[var(--wireline-typography-overline-size)] font-semibold text-foreground leading-none mb-0.5">
                {label}
              </p>
              <p className="text-[var(--wireline-typography-overline-size)] text-muted/70 leading-tight">
                {detail}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.32em] text-muted/70">
        <a
          href="/status"
          className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full dot-online" />
          System status
        </a>
        <span className="text-muted/30">·</span>
        <a href="/security" className="hover:text-foreground transition-colors">
          Security
        </a>
        <span className="text-muted/30">·</span>
        <a href="/changelog" className="hover:text-foreground transition-colors">
          Changelog
        </a>
        <span className="text-muted/30">·</span>
        <a href="/pricing" className="hover:text-foreground transition-colors">
          Pricing
        </a>
        <span className="text-muted/30">·</span>
        <a href="/compare" className="hover:text-foreground transition-colors">
          Compare
        </a>
      </div>
    </motion.section>
  );
}
