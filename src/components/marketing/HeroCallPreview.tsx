import { motion, useReducedMotion } from "motion/react";
import { Check, Calendar, MessageSquare } from "lucide-react";

/**
 * HeroCallPreview — an ambient, non-interactive "live call" visual for the
 * landing hero. It shows the product *doing the job* in one frame: the agent's
 * persona + vibe, a live call status, a streaming transcript, and a real tool
 * action (booking → Calendar/SMS). Purely decorative/illustrative — the real,
 * callable demo lines live in <BrowserCallWidget> right below it.
 *
 * Aurora Cream contract: razor-edge surfaces (circles via `rounded-full` only),
 * `from-brand to-brand-deep` gradient, mono micro-labels, Fraunces display.
 * All motion is gated on `useReducedMotion()` and resolves to a correct, static
 * resting state — the visual must read perfectly with zero animation.
 */

const BAR_COUNT = 36;
// Deterministic per-bar heights (SSR/hydration-safe — no Math.random at render).
const REST = (i: number) => 5 + ((i * 7) % 9); // 5..13px resting height
const PEAK = (i: number) => 12 + ((i * 13) % 18); // 12..29px animated peak

export default function HeroCallPreview() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto mt-10 lg:mt-12 w-full max-w-md text-left"
      aria-label="Live call preview: a Wireline agent answering an inbound call and booking an appointment"
    >
      {/* soft brand halo */}
      <span
        aria-hidden="true"
        className="absolute -inset-6 -z-10 bg-brand/15 blur-2xl scale-105"
      />

      <div className="relative border border-ink/10 bg-gradient-to-b from-white/85 to-paper shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_30px_60px_-30px_rgba(26,22,20,0.45)]">
        {/* ── Header: agent identity + live status ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-ink/10">
          <div className="relative w-11 h-11 shrink-0">
            <span
              aria-hidden="true"
              className="absolute -inset-1 rounded-full border border-brand/25"
            />
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand to-brand-deep grid place-items-center text-white font-display italic text-xl shadow-[0_6px_16px_-8px_rgba(79,30,123,0.7)]">
              S
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 font-semibold text-[15px] tracking-tight text-ink">
              Sarah
              <span className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-brand border border-brand/30 px-1.5 py-0.5">
                warm
              </span>
            </div>
            <p className="text-[12px] text-muted mt-0.5">Front desk · inbound</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              {!reduce && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/60" />
              )}
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="font-mono text-[11px] text-ink tracking-[0.04em] tabular-nums">
              ON CALL · 0:42
            </span>
          </div>
        </div>

        {/* ── Live waveform ── */}
        <div
          className="flex items-end justify-center gap-[3px] h-12 px-5 border-b border-ink/10 bg-brand/[0.02]"
          aria-hidden="true"
        >
          {Array.from({ length: BAR_COUNT }).map((_, i) => (
            <motion.span
              key={i}
              className="w-[3px] bg-gradient-to-b from-brand to-brand-deep/90"
              style={{ height: reduce ? PEAK(i) * 0.6 : REST(i) }}
              animate={reduce ? undefined : { height: [REST(i), PEAK(i), REST(i)] }}
              transition={
                reduce
                  ? undefined
                  : {
                      duration: 0.85 + (i % 5) * 0.13,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: (i * 0.04) % 0.55,
                    }
              }
            />
          ))}
        </div>

        {/* ── Streaming transcript ── */}
        <div className="px-5 py-4 flex flex-col gap-2.5">
          <div className="self-start max-w-[84%] text-[13.5px] leading-snug px-3 py-2 border border-ink/10 bg-ink/[0.03]">
            <span className="block font-mono text-[8.5px] tracking-[0.14em] uppercase text-muted mb-1">
              Caller
            </span>
            Hi — do you have any openings this Saturday?
          </div>
          <div className="self-end max-w-[84%] text-[13.5px] leading-snug px-3 py-2 border border-brand/20 bg-brand/[0.07]">
            <span className="block font-mono text-[8.5px] tracking-[0.14em] uppercase text-muted mb-1">
              Sarah
            </span>
            We do — 9:30 or 2:15. Want me to lock one in?
            {!reduce && (
              <motion.span
                className="inline-block w-[6px] h-[14px] bg-brand align-[-2px] ml-0.5"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>

        {/* ── Tool action footer ── */}
        <div className="flex items-center gap-2.5 px-5 py-3 border-t border-ink/10 bg-white/40">
          <span className="w-[18px] h-[18px] rounded-full bg-emerald-500 grid place-items-center text-white shrink-0">
            <Check className="w-3 h-3" strokeWidth={3} />
          </span>
          <span className="text-[12.5px] text-ink">
            <strong className="font-semibold">Booking appointment</strong> — Sat 9:30 AM
          </span>
          <span className="ml-auto flex gap-1.5">
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted border border-ink/10 px-1.5 py-1 inline-flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" aria-hidden="true" />
              Calendar
            </span>
            <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted border border-ink/10 px-1.5 py-1 inline-flex items-center gap-1">
              <MessageSquare className="w-2.5 h-2.5" aria-hidden="true" />
              SMS
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}
