import { motion, useReducedMotion } from "motion/react";
import { Calendar, Check, MessageSquare, PhoneCall } from "lucide-react";

/**
 * HeroCallPreview — crisp, static-first product artifact for the landing hero.
 *
 * The previous version relied on purple glow halos that bled into the cream
 * surface. This version treats the preview like an enterprise product screenshot:
 * hard edges, restrained depth, readable transcript, and minimal motion.
 */

const BAR_COUNT = 38;
const REST = (i: number) => 5 + ((i * 7) % 8);
const PEAK = (i: number) => 13 + ((i * 11) % 18);
const PEAK2 = (i: number) => 8 + ((i * 17) % 10);

export default function HeroCallPreview() {
  const reduce = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.65, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-full max-w-xl text-left"
      aria-label="Live call preview: a Wireline agent answering an inbound call and booking an appointment"
    >
      <div className="relative border border-ink/[0.14] bg-[#FAF8FF] shadow-[0_24px_70px_-42px_rgba(30,27,46,0.55),0_1px_0_rgba(255,255,255,0.8)_inset]">
        <div className="flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-ink/[0.1] bg-white/[0.42]">
          <div className="relative grid h-11 w-11 shrink-0 place-items-center border border-ink/[0.12] bg-card shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]">
            <div className="grid h-8 w-8 place-items-center bg-brand text-white font-display text-lg leading-none">
              S
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-semibold text-[14px] tracking-tight text-foreground">
              Sarah
              <span className="border border-brand/20 bg-brand/[0.05] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-brand">
                warm
              </span>
            </div>
            <p className="mt-0.5 text-[12px] text-foreground/58">Front desk · inbound support</p>
          </div>

          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              {!reduce && (
                <span className="absolute inline-flex h-full w-full animate-ping bg-brand/45" />
              )}
              <span className="relative inline-flex h-2 w-2 bg-brand" />
            </span>
            <span className="font-mono text-[10px] text-foreground/72 tracking-[0.08em] tabular-nums">
              ON CALL · 0:42
            </span>
          </div>
        </div>

        <div
          className="flex h-14 items-end justify-center gap-[2.5px] border-b border-ink/[0.1] bg-[linear-gradient(180deg,rgba(255,255,255,0.42),rgba(30,27,46,0.025))] px-4"
          aria-hidden="true"
        >
          {Array.from({ length: BAR_COUNT }).map((_, i) => {
            const peakTarget = i % 3 === 0 ? PEAK(i) : PEAK2(i);
            return (
              <motion.span
                key={i}
                className="flex-1 max-w-[4px] bg-brand/55"
                initial={{ height: reduce ? peakTarget * 0.55 : REST(i) }}
                animate={
                  reduce
                    ? undefined
                    : {
                        height: [REST(i), peakTarget, REST(i)],
                        opacity: [0.42, 0.9, 0.42],
                      }
                }
                transition={
                  reduce
                    ? undefined
                    : {
                        duration: 0.9 + (i % 5) * 0.08,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: (i * 0.035) % 0.55,
                      }
                }
              />
            );
          })}
        </div>

        <div className="flex flex-col gap-3 px-4 sm:px-5 py-4">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[86%] border border-ink/[0.1] bg-white/[0.55] px-3 py-2.5 text-[13px] leading-snug text-foreground"
          >
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/48">
              Caller
            </span>
            Hi — do you have any openings this Saturday?
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.82, ease: [0.16, 1, 0.3, 1] }}
            className="ml-auto max-w-[86%] border border-brand/18 bg-brand/[0.045] px-3 py-2.5 text-[13px] leading-snug text-foreground"
          >
            <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/48">
              Sarah
            </span>
            We do — 9:30 or 2:15. Want me to lock one in?
            {!reduce && (
              <motion.span
                className="ml-0.5 inline-block h-[13px] w-[5px] align-[-2px] bg-brand/70"
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 0.55, repeat: Infinity, repeatType: "reverse" }}
                aria-hidden="true"
              />
            )}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 1.08, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-wrap items-center gap-2.5 border-t border-ink/[0.1] bg-white/[0.48] px-4 sm:px-5 py-3"
        >
          <span className="grid h-[18px] w-[18px] shrink-0 place-items-center bg-brand text-white">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
          <span className="text-[12.5px] text-foreground">
            <strong className="font-semibold">Booking appointment</strong> — Sat 9:30 AM
          </span>
          <span className="ml-auto flex gap-1.5">
            <span className="inline-flex items-center gap-1 border border-ink/[0.1] px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground/55">
              <Calendar className="h-2.5 w-2.5" aria-hidden="true" />
              Calendar
            </span>
            <span className="inline-flex items-center gap-1 border border-ink/[0.1] px-1.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground/55">
              <MessageSquare className="h-2.5 w-2.5" aria-hidden="true" />
              SMS
            </span>
          </span>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, delay: 1.24, ease: [0.16, 1, 0.3, 1] }}
        className="absolute -bottom-4 left-6 inline-flex items-center gap-1.5 border border-brand/22 bg-[#F9F9F7]/95 px-3 py-1.5 shadow-[0_12px_30px_-24px_rgba(30,27,46,0.5)] backdrop-blur-sm"
      >
        <PhoneCall className="h-3 w-3 text-brand" aria-hidden="true" />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-brand/90">
          Active · handled by assistant
        </span>
      </motion.div>
    </motion.div>
  );
}
