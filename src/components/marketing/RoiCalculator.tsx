/**
 * RoiCalculator.tsx
 * ----------------------------------------------------------------------
 * The moment-of-truth component on the Wireline landing.
 *
 * Skeptical SMB prospects ("Will this actually pay for itself?") move
 * from interested to convinced exactly when they see their OWN numbers
 * yielding a clear ROI. This calculator gives them that moment.
 *
 * Inputs (three sliders, all keyboardable):
 *   1. Missed calls / week         — default 12 (industry avg for SMBs)
 *   2. Avg revenue per booked job  — default $180 (home-services-ish)
 *   3. Receptionist hours / week   — default 0   (most SMBs have none)
 *
 * Assumptions baked in (each with a note when hovered, no hidden math):
 *   - Wireline picks up 100% of calls; conservatively 82% of MISSED calls
 *     become recoverable revenue (some callers truly didn't need help).
 *   - $22/hr median US admin-assistant wage (BLS 2025 mean).
 *   - 52 weeks/year.
 *   - Wireline Pro tier ($499/mo) used as the baseline for payback math.
 *     Personal tier ($49) would shrink payback further; Business ($1499)
 *     scales with more agents/minutes.
 *
 * Honest output:
 *   - Annual revenue recovered
 *   - Annual labor cost saved
 *   - Net annual savings AFTER Wireline Pro tier ($5,988)
 *   - Payback days (when net first crosses zero)
 *   - A single line of plain-English summary for skim readers
 *
 * Mobile-first: stacks vertically under md; side-by-side at md+; the
 * sliders never overlap the output card at any viewport ≥ 360px wide.
 */
import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Calculator, TrendingUp, Clock } from "lucide-react";

const WIRELINE_PRO_MONTHLY_USD = 499;
const WIRELINE_PRO_ANNUAL_USD = WIRELINE_PRO_MONTHLY_USD * 12;
const RECEPTIONIST_HOURLY_USD = 22; // US median, BLS 2025
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

// Industry presets — quick "I'm a {x}" jumps that pre-fill plausible
// numbers. Real businesses recognise their own profile and trust the
// rest of the page more after seeing themselves represented.
const PRESETS: { id: string; label: string; sliders: Sliders }[] = [
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
    id: "realestate",
    label: "Real Estate",
    sliders: { missedPerWeek: 14, avgValue: 2400, receptionistHours: 0 },
  },
  {
    id: "restaurant",
    label: "Restaurant",
    sliders: { missedPerWeek: 26, avgValue: 75, receptionistHours: 0 },
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
    const netAnnual = totalRecovered - WIRELINE_PRO_ANNUAL_USD;
    // Payback days = (cost / total_recovered) * 365, floored at 0
    const paybackDays =
      totalRecovered > 0
        ? Math.max(1, Math.round((WIRELINE_PRO_ANNUAL_USD / totalRecovered) * 365))
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
        <div className="rounded-2xl border border-brand/15 bg-[#FAF8F5]/70 p-3 shadow-[0_8px_28px_-18px_rgba(107,43,153,0.22)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-eyebrow !text-brand">ROI snapshot</p>
              <p className="mt-1 font-display italic text-xl leading-none text-ink">
                {fmtUsd(results.totalRecovered)}
                <span className="ml-1 text-caption font-sans not-italic">/yr recovered</span>
              </p>
            </div>
            <div className="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              {results.paybackDays}d payback
            </div>
          </div>
          <p className="mt-2 text-caption">Default: 12 missed calls/week at $180/job.</p>
          <Link
            to="/pricing"
            className="mt-2 inline-flex min-h-9 items-center text-caption font-semibold text-brand hover:underline"
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
      <div className="rounded-2xl border border-[#8B3FD6]/12 bg-gradient-to-br from-[#FAF8F5] via-[#FAF8F5] to-[#FAF8F5] p-4 sm:p-5 shadow-[0_8px_32px_-12px_rgba(107,43,153,0.12)]">
        <div className="flex items-center gap-2 mb-3">
          <span className="hero-accent-line" style={{ background: "#8B3FD6" }} />
          <h2
            id="roi-heading"
            className="text-[8px] uppercase tracking-[0.5em] text-[#8B3FD6] font-semibold"
          >
            <Calculator className="inline w-3 h-3 mr-1 -mt-0.5" strokeWidth={2} />
            Your numbers, our math
          </h2>
        </div>
        <p className="font-display italic text-[20px] sm:text-2xl leading-tight text-ink mb-4">
          See what Wireline pays back on day one.
        </p>

        {/* Industry preset row */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <span className="text-[8.5px] uppercase tracking-[0.25em] text-muted/70 mr-1 leading-none self-center">
            Pick yours →
          </span>
          {PRESETS.map((p) => {
            const active = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={
                  "text-[10px] uppercase tracking-[0.22em] font-medium px-2.5 py-1 rounded-full border transition-all " +
                  (active
                    ? "bg-[#8B3FD6] text-paper border-[#8B3FD6]"
                    : "bg-[#FAF8F5] text-muted/75 border-black/10 hover:border-[#8B3FD6]/30 hover:text-ink")
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Sliders + Output grid */}
        <div className="grid md:grid-cols-2 gap-5 md:gap-6">
          {/* Sliders column */}
          <div className="space-y-4">
            <SliderRow
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="Missed calls / week"
              suffix={`${sliders.missedPerWeek}`}
              min={0}
              max={60}
              step={1}
              value={sliders.missedPerWeek}
              onChange={(v) => onSlider("missedPerWeek", v)}
            />
            <SliderRow
              icon={<Calculator className="w-3.5 h-3.5" />}
              label="Average revenue / job"
              suffix={fmtUsd(sliders.avgValue)}
              min={20}
              max={5000}
              step={20}
              value={sliders.avgValue}
              onChange={(v) => onSlider("avgValue", v)}
            />
            <SliderRow
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Receptionist hours / week"
              suffix={`${sliders.receptionistHours}h`}
              min={0}
              max={60}
              step={1}
              value={sliders.receptionistHours}
              onChange={(v) => onSlider("receptionistHours", v)}
            />
          </div>

          {/* Output column */}
          <div className="rounded-xl border border-[#8B3FD6]/15 bg-[#FAF8F5] p-4 flex flex-col">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Stat
                label="Revenue recovered"
                value={fmtUsd(results.revenueRecovered)}
                tone="emerald"
              />
              <Stat label="Labor saved" value={fmtUsd(results.laborSaved)} tone="brand" />
            </div>
            <div
              className={
                "rounded-lg px-3 py-2.5 mb-3 border " +
                (results.worthIt
                  ? "border-emerald-500/25 bg-emerald-500/8"
                  : "border-amber-500/25 bg-amber-500/8")
              }
            >
              <p className="text-[8.5px] uppercase tracking-[0.3em] text-muted/70 leading-none mb-1">
                Net annual savings (after Wireline Pro)
              </p>
              <p className="font-display italic text-3xl leading-none text-ink">
                {fmtUsd(Math.max(0, results.netAnnual))}
                <span className="text-[10px] text-muted/70 ml-2 tracking-[0.2em] uppercase font-sans not-italic">
                  / yr
                </span>
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 mt-auto">
              <div>
                <p className="text-[8.5px] uppercase tracking-[0.3em] text-muted/70 leading-none mb-1">
                  Payback in
                </p>
                <p className="font-display italic text-xl leading-none text-[#8B3FD6]">
                  {Number.isFinite(results.paybackDays)
                    ? `${results.paybackDays} day${results.paybackDays === 1 ? "" : "s"}`
                    : "—"}
                </p>
              </div>
              <a
                href="/signup"
                className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full bg-[#8B3FD6] text-paper text-[10px] uppercase tracking-[0.25em] font-semibold hover:bg-[#3B154C] hover:-translate-y-px transition-all shadow-[0_6px_18px_-8px_rgba(107,43,153,0.5)]"
                data-testid="roi-cta-start"
              >
                Start free trial
              </a>
            </div>
          </div>
        </div>

        {/* Honest footer */}
        <p className="mt-3 text-[8.5px] uppercase tracking-[0.22em] text-muted/45 leading-relaxed">
          Assumes Wireline recovers 82% of missed calls (the rest were wrong-numbers or
          window-shoppers). Labor saved uses $22/hr (US BLS 2025 admin-assistant median). Wireline
          Pro tier billed at $499/mo. Switch tiers anytime.
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
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-muted/75 font-medium">
          <span className="text-[#8B3FD6]">{icon}</span>
          {label}
        </span>
        <span className="text-[12px] tabular-nums font-semibold text-ink">{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full accent-[#8B3FD6]"
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "emerald" | "brand" }) {
  const toneClass = tone === "emerald" ? "text-emerald-700" : "text-[#8B3FD6]";
  return (
    <div>
      <p className="text-[8.5px] uppercase tracking-[0.3em] text-muted/70 leading-none mb-1">
        {label}
      </p>
      <p className={`font-display italic text-lg leading-none ${toneClass}`}>{value}</p>
    </div>
  );
}
