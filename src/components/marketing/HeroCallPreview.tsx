import { motion, useReducedMotion } from "motion/react";
import { Check, Calendar, MessageSquare, PhoneCall } from "lucide-react";

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

const BAR_COUNT = 42;
// Deterministic per-bar heights (SSR/hydration-safe — no Math.random at render).
const REST = (i: number) => 4 + ((i * 7) % 10); // 4..13px resting height
const PEAK = (i: number) => 14 + ((i * 11) % 22); // 14..35px animated peak
// Secondary amplitude shape — fills the silence gaps between peaks
const PEAK2 = (i: number) => 8 + ((i * 17) % 12); // 8..19px mid-peak

export default function HeroCallPreview() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 22, scale: 0.982 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto mt-10 lg:mt-12 w-full max-w-md text-left"
      aria-label="Live call preview: a Wireline agent answering an inbound call and booking an appointment"
    >
      {/* layered brand halos for depth */}
      <span aria-hidden="true" className="absolute -inset-8 -z-10 bg-brand/20 blur-3xl scale-105" />
      <span aria-hidden="true" className="absolute -inset-4 -z-10 bg-brand/10 blur-xl scale-100" />

      <div className="relative border border-ink/10 bg-gradient-to-b from-white/90 to-paper/95 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_40px_80px_-30px_rgba(26,22,20,0.5)]">
        {/* ── Header: agent identity + live status ── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-ink/10">
          <div className="relative w-11 h-11 shrink-0">
            {/* dual-ring avatar surround */}
            <span
              aria-hidden="true"
              className="absolute -inset-1.5 rounded-full border border-brand/20"
            />
            <span
              aria-hidden="true"
              className="absolute -inset-3 rounded-full border border-brand/10"
            />
            <motion.div
              animate={
                reduce
                  ? {}
                  : {
                      boxShadow: [
                        "0 6px 16px -8px rgba(79,30,123,0.5)",
                        "0 8px 22px -6px rgba(79,30,123,0.9)",
                        "0 6px 16px -8px rgba(79,30,123,0.5)",
                      ],
                    }
              }
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
              className="w-11 h-11 rounded-full bg-gradient-to-br from-brand to-brand-deep grid place-items-center text-white font-display italic text-xl"
            >
              S
            </motion.div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 font-semibold text-[15px] tracking-tight text-ink">
              Sarah
              <motion.span
                animate={
                  reduce
                    ? {}
                    : {
                        borderColor: [
                          "rgba(79,30,123,0.3)",
                          "rgba(79,30,123,0.75)",
                          "rgba(79,30,123,0.3)",
                        ],
                      }
                }
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-brand border px-1.5 py-0.5"
              >
                warm
              </motion.span>
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

        {/* ── Live waveform — richer with dual-layered bars ── */}
        <div
          className="flex items-end justify-center gap-[2.5px] h-14 px-4 border-b border-ink/10 bg-brand/[0.025]"
          aria-hidden="true"
        >
          {Array.from({ length: BAR_COUNT }).map((_, i) => {
            const peakTarget = i % 3 === 0 ? PEAK(i) : PEAK2(i);
            return (
              <motion.span
                key={i}
                className="flex-1 max-w-[4px] bg-gradient-to-b from-brand via-brand/80 to-brand-deep/60"
                style={{ borderRadius: "1px 1px 0 0" }}
                initial={{ height: reduce ? peakTarget * 0.55 : REST(i) }}
                animate={
                  reduce
                    ? undefined
                    : {
                        height: [REST(i), peakTarget, REST(i)],
                        opacity: [0.6, 1, 0.6],
                      }
                }
                transition={
                  reduce
                    ? undefined
                    : {
                        duration: 0.75 + (i % 6) * 0.11,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: (i * 0.035) % 0.65,
                      }
                }
              />
            );
          })}
        </div>

        {/* ── Streaming transcript — staggered entrance ── */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <motion.div
            initial={{ opacity: 0, x: -14, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: 1.1, ease: [0.16, 1, 0.3, 1] }}
            className="self-start max-w-[84%] text-[13.5px] leading-snug px-3 py-2.5 border border-ink/10 bg-ink/[0.03]"
          >
            <span className="block font-mono text-[8.5px] tracking-[0.14em] uppercase text-muted mb-1.5">
              Caller
            </span>
            Hi — do you have any openings this Saturday?
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 14, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.55, delay: 1.7, ease: [0.16, 1, 0.3, 1] }}
            className="self-end max-w-[84%] text-[13.5px] leading-snug px-3 py-2.5 border border-brand/22 bg-brand/[0.07]"
          >
            <span className="block font-mono text-[8.5px] tracking-[0.14em] uppercase text-muted mb-1.5">
              Sarah
            </span>
            We do — 9:30 or 2:15. Want me to lock one in?
            {!reduce && (
              <motion.span
                className="inline-block w-[6px] h-[14px] bg-brand align-[-2px] ml-0.5"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.55, repeat: Infinity, repeatType: "reverse" }}
                aria-hidden="true"
              />
            )}
          </motion.div>
        </div>

        {/* ── Tool action footer — flashes in after conversation ── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 2.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-2.5 px-5 py-3 border-t border-ink/10 bg-white/50"
        >
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 2.65, ease: [0.34, 1.56, 0.64, 1] }}
            className="w-[18px] h-[18px] rounded-full bg-emerald-500 grid place-items-center text-white shrink-0"
          >
            <Check className="w-3 h-3" strokeWidth={3} />
          </motion.span>
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
        </motion.div>
      </div>

      {/* Live activity badge — floats below the card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 2.9, ease: [0.16, 1, 0.3, 1] }}
        className="absolute -bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-500/25 bg-emerald-50/90 backdrop-blur-sm"
      >
        <PhoneCall className="w-3 h-3 text-emerald-600" aria-hidden="true" />
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-emerald-700">
          Live · Agent handling call
        </span>
      </motion.div>
    </motion.div>
  );
}
