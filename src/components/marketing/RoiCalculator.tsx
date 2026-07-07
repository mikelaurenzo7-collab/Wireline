import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Calculator, Clock, TrendingUp } from "lucide-react";
import { Slider } from "../ui/shadcn/Slider";
import { ShadButton } from "../ui/shadcn/ShadButton";

const WIRELINE_BUSINESS_MONTHLY_USD = 59;
const WIRELINE_BUSINESS_ANNUAL_USD = WIRELINE_BUSINESS_MONTHLY_USD * 12;
const RECEPTIONIST_HOURLY_USD = 22;
const MISSED_CALL_RECOVERY_PCT = 0.82;

interface Sliders {
  missedPerWeek: number;
  avgValue: number;
  receptionistHours: number;
}

const DEFAULTS: Sliders = {
  missedPerWeek: 12,
  avgValue: 180,
  receptionistHours: 0,
};

const PRESETS: { id: string; label: string; sliders: Sliders }[] = [
  {
    id: "personal",
    label: "Personal",
    sliders: { missedPerWeek: 6, avgValue: 80, receptionistHours: 0 },
  },
  {
    id: "homeservices",
    label: "Home Services",
    sliders: { missedPerWeek: 18, avgValue: 240, receptionistHours: 0 },
  },
  {
    id: "medical",
    label: "Medical / Dental",
    sliders: { missedPerWeek: 22, avgValue: 320, receptionistHours: 30 },
  },
  {
    id: "legal",
    label: "Legal",
    sliders: { missedPerWeek: 8, avgValue: 1200, receptionistHours: 20 },
  },
  {
    id: "sales",
    label: "Sales Team",
    sliders: { missedPerWeek: 20, avgValue: 900, receptionistHours: 10 },
  },
  {
    id: "support",
    label: "Support Queue",
    sliders: { missedPerWeek: 34, avgValue: 70, receptionistHours: 25 },
  },
  {
    id: "agency",
    label: "Agency / Studio",
    sliders: { missedPerWeek: 10, avgValue: 1500, receptionistHours: 6 },
  },
];

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default function RoiCalculator({ compact = false }: { compact?: boolean }) {
  const [sliders, setSliders] = useState<Sliders>(DEFAULTS);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSliders(preset.sliders);
    setActivePreset(presetId);
  };

  const onSlider = (key: keyof Sliders, value: number) => {
    setSliders((s) => ({ ...s, [key]: value }));
    setActivePreset(null);
  };

  const results = useMemo(() => {
    const recoveredCallsPerYear = sliders.missedPerWeek * MISSED_CALL_RECOVERY_PCT * 52;
    const revenueRecovered = recoveredCallsPerYear * sliders.avgValue;
    const laborSaved = sliders.receptionistHours * RECEPTIONIST_HOURLY_USD * 52;
    const totalRecovered = revenueRecovered + laborSaved;
    const netAnnual = totalRecovered - WIRELINE_BUSINESS_ANNUAL_USD;
    const paybackDays =
      totalRecovered > 0
        ? Math.max(1, Math.round((WIRELINE_BUSINESS_ANNUAL_USD / totalRecovered) * 365))
        : Infinity;

    return {
      revenueRecovered,
      laborSaved,
      totalRecovered,
      netAnnual,
      paybackDays,
      worthIt: netAnnual > 0,
    };
  }, [sliders]);

  if (compact) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="mt-0 shrink-0"
        aria-label="ROI snapshot"
      >
        <div className="rounded-md border border-primary/15 bg-card/70 p-3 shadow-[var(--wireline-elevation-sm)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-eyebrow !text-primary">ROI snapshot</p>
              <p className="mt-1 font-display italic text-xl leading-none text-foreground">
                {fmtUsd(results.totalRecovered)}
                <span className="ml-1 text-caption font-sans not-italic">/yr recovered</span>
              </p>
            </div>
            <div className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[var(--wireline-typography-overline-size)] font-semibold wl-text-success">
              {results.paybackDays}d payback
            </div>
          </div>
          <p className="mt-2 text-caption">Default: 12 missed calls/week at $180/call.</p>
          <Link
            to="/pricing"
            className="mt-2 inline-flex min-h-9 items-center text-caption font-semibold text-primary hover:underline"
          >
            Full ROI calculator →
          </Link>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="mb-8"
      aria-labelledby="roi-heading"
      data-testid="roi-calculator"
    >
      <div className="rounded-md border border-primary/12 bg-card p-4 sm:p-5 shadow-[var(--wireline-elevation-sm)]">
        <div className="flex items-center gap-2 mb-3">
          <span className="hero-accent-line bg-brand" />
          <h2
            id="roi-heading"
            className="text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.5em] text-primary font-semibold"
          >
            <Calculator className="inline w-3 h-3 mr-1 -mt-0.5" strokeWidth={2} />
            Your numbers, our math
          </h2>
        </div>
        <p className="font-display italic text-[var(--wireline-typography-h3-size)] sm:text-2xl leading-tight text-foreground mb-4">
          See what Wireline pays back across personal, sales, support, and service workflows.
        </p>

        <div className="flex flex-wrap gap-1.5 mb-4" aria-label="ROI presets">
          <span className="text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.25em] text-muted/70 mr-1 leading-none self-center">
            Pick yours →
          </span>
          {PRESETS.map((p) => {
            const active = activePreset === p.id;
            return (
              <ShadButton
                key={p.id}
                type="button"
                disableAnimations
                variant={active ? "default" : "outline"}
                size="sm"
                aria-pressed={active}
                onClick={() => applyPreset(p.id)}
                className={
                  "text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] font-medium px-2.5 py-1 rounded-full " +
                  (active
                    ? "bg-brand text-paper border-brand"
                    : "bg-card text-muted/75 border-border hover:border-primary/30 hover:text-foreground")
                }
              >
                {p.label}
              </ShadButton>
            );
          })}
        </div>

        <div className="grid md:grid-cols-2 gap-5 md:gap-6">
          <div className="space-y-4">
            <SliderRow
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="Missed conversations / week"
              suffix={`${sliders.missedPerWeek}`}
              min={0}
              max={60}
              step={1}
              value={sliders.missedPerWeek}
              onChange={(v) => onSlider("missedPerWeek", v)}
            />
            <SliderRow
              icon={<Calculator className="w-3.5 h-3.5" />}
              label="Average value / resolved call"
              suffix={fmtUsd(sliders.avgValue)}
              min={20}
              max={5000}
              step={20}
              value={sliders.avgValue}
              onChange={(v) => onSlider("avgValue", v)}
            />
            <SliderRow
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Coverage hours / week"
              suffix={`${sliders.receptionistHours}h`}
              min={0}
              max={60}
              step={1}
              value={sliders.receptionistHours}
              onChange={(v) => onSlider("receptionistHours", v)}
            />
          </div>

          <div className="rounded-md border border-primary/15 bg-card p-4 flex flex-col" aria-live="polite">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Stat
                label="Revenue recovered"
                value={fmtUsd(results.revenueRecovered)}
                tone="success"
              />
              <Stat label="Labor saved" value={fmtUsd(results.laborSaved)} tone="brand" />
            </div>
            <div
              className={
                "rounded-md px-3 py-2.5 mb-3 border " +
                (results.worthIt
                  ? "border-primary/25 bg-primary/8 wl-status-success"
                  : "border-destructive/25 bg-destructive/8")
              }
            >
              <p className="wl-label-muted leading-none mb-1">
                Net annual savings (after Wireline Business)
              </p>
              <p className="font-display italic text-3xl leading-none text-foreground">
                {fmtUsd(Math.max(0, results.netAnnual))}
                <span className="text-[var(--wireline-typography-overline-size)] text-muted/70 ml-2 tracking-[0.2em] uppercase font-sans not-italic">
                  / yr
                </span>
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 mt-auto">
              <div>
                <p className="text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.3em] text-muted/70 leading-none mb-1">
                  Payback in
                </p>
                <p className="font-display italic text-xl leading-none text-primary">
                  {Number.isFinite(results.paybackDays)
                    ? `${results.paybackDays} day${results.paybackDays === 1 ? "" : "s"}`
                    : "—"}
                </p>
              </div>
              <Link
                to="/signup"
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-brand text-paper text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.25em] font-semibold hover:bg-brand-deep hover:-translate-y-px transition-all shadow-[var(--wireline-elevation-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                data-testid="roi-cta-start"
              >
                Start free
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-3 text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] text-muted/45 leading-relaxed">
          Assumes Wireline recovers 82% of missed conversations. Coverage math uses $22/hr
          for comparable admin time. Wireline Business tier billed at $59/mo. Create and train
          for free; live work uses Conversation Balance.
        </p>
      </div>
    </motion.section>
  );
}

function SliderRow({
  icon,
  label,
  suffix,
  min,
  max,
  step,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="flex items-center gap-1.5 text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.22em] text-muted/75 font-medium">
          <span className="text-primary">{icon}</span>
          {label}
        </span>
        <span className="text-[var(--wireline-typography-caption-size)] tabular-nums font-semibold text-foreground">
          {suffix}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        aria-valuetext={suffix}
        className="w-full accent-brand"
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "success" | "brand" }) {
  const toneClass = tone === "success" ? "wl-text-success" : "text-primary";
  return (
    <div>
      <p className="wl-label-muted leading-none mb-1">{label}</p>
      <p className={`font-display italic text-lg leading-none ${toneClass}`}>{value}</p>
    </div>
  );
}
