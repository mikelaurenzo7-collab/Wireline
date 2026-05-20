/**
 * /showcase — playable agent templates for prospects.
 *
 * Each card is a pre-tuned persona a prospect can audition in the
 * browser (pre-roll audio + first-message), then deploy with one
 * click. The marquee entry is the "Singing Receptionist" (Mira): a
 * pre-baked ElevenLabs Music jingle plays the moment the user
 * clicks Play, then the agent's text first-message "catches itself"
 * with a normal greeting.
 *
 * Why this exists: the landing-page demo grid is great for "call
 * this number now", but it forces the visitor onto their phone.
 * /showcase lets them sample the platform without leaving the
 * browser tab they're already in — the lowest-friction path from
 * "I'm curious" to "let me sign up."
 *
 * Audio pipeline:
 *   1. scripts/generate-jingle.mjs (or POST /api/admin/generate-jingle)
 *      hits the ElevenLabs Music API once, writes the MP3 to
 *      /public/sounds/wireline-jingle.mp3, commits.
 *   2. This page plays that MP3 in a hidden <audio> element on click.
 *   3. For real inbound calls, /api/twilio-webhook/singing-receptionist
 *      plays the same MP3 via TwiML before bridging to Vapi (SIP).
 */
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Phone, Play, Pause, Sparkles, Volume2 } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "../components/WirelineMark";
import { SHOWCASE_AGENTS, type ShowcaseAgent } from "../data/showcase-agents";

/**
 * Single playable showcase card. Keeps audio-element state local
 * so multiple cards on the page each manage their own playback
 * without a parent reducer. Pause + currentTime reset gives a
 * clean stop-and-restart on toggle.
 */
function ShowcaseCard({ agent }: { agent: ShowcaseAgent }) {
  const [playing, setPlaying] = useState(false);
  const [errored, setErrored] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      el.currentTime = 0;
      setPlaying(false);
    } else {
      el.play().catch(() => {
        // Most browsers require a user gesture; we always trigger
        // from onClick so the catch only fires on truly blocked
        // contexts (Safari autoplay policy, etc).
        setPlaying(false);
      });
      setPlaying(true);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="rounded-3xl glass border border-brand/25 p-6 sm:p-8"
    >
      <div className="flex items-start gap-4 mb-5">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: agent.tint }}
        >
          <Sparkles className="w-5 h-5 text-on-brand" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.4em] text-brand/80 mb-1 font-medium">
            {agent.role}
          </p>
          <h3 className="font-display italic text-2xl sm:text-3xl text-ink leading-tight">
            {agent.name}
          </h3>
          <p className="text-[12px] text-muted/70 mt-1">Voice: {agent.voiceLabel}</p>
        </div>
      </div>

      <p className="text-sm sm:text-base text-ink/80 leading-relaxed mb-4">{agent.tagline}</p>

      {agent.preRollAudio ? (
        <>
          <div className="rounded-2xl bg-ink/5 border border-white/10 p-4 mb-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-muted/70 mb-2">
              First-message script
            </p>
            <p className="text-sm text-ink/90 italic leading-relaxed">"{agent.firstMessage}"</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              aria-pressed={playing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
            >
              {playing ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  Stop the jingle
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Hear her sing
                </>
              )}
            </button>
            <a
              href={`tel:${agent.tel}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full glass border border-black/12 text-ink text-[11px] uppercase tracking-[0.3em] font-medium hover:border-brand/40 transition-all"
            >
              <Phone className="w-3.5 h-3.5" />
              Or call {agent.display}
            </a>
          </div>
          {errored ? (
            <p className="mt-3 text-[11px] text-amber-600/90">
              Jingle MP3 isn't on this deploy yet. Run{" "}
              <code className="font-mono">node scripts/generate-jingle.mjs</code> + commit, or POST{" "}
              <code className="font-mono">/api/admin/generate-jingle</code>.
            </p>
          ) : null}
          {/*
            preload="none" — don't fetch the MP3 until the visitor
            clicks Play. Saves bandwidth on a public page that gets
            crawled + scraped. onError lets the UI degrade gracefully
            when the file hasn't been baked yet.
          */}
          <audio
            ref={audioRef}
            src={agent.preRollAudio}
            preload="none"
            onEnded={() => setPlaying(false)}
            onError={() => {
              setErrored(true);
              setPlaying(false);
            }}
          />
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`tel:${agent.tel}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
          >
            <Phone className="w-3.5 h-3.5" />
            Call {agent.display}
          </a>
        </div>
      )}
    </motion.div>
  );
}

export default function Showcase() {
  return (
    <div className="min-h-screen relative bg-paper text-ink">
      <PageMeta
        title="Showcase — Playable AI Agent Templates · Wireline"
        description="Audition Wireline's voice agents in your browser before signing up. The marquee fun demo: a singing receptionist who sings the moment you connect, then catches herself with a normal greeting."
      />

      {/* Aurora — matches /about + /compare so the public surface feels like one product. */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <motion.div
          className="absolute -top-[25%] -left-[15%] w-[40vw] h-[40vw] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79, 30, 123 ,0.10), transparent 65%)",
          }}
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-[20%] -right-[15%] w-[40vw] h-[40vw] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(236, 72, 153 ,0.10), transparent 65%)",
          }}
          animate={{ x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <header className="relative z-10 px-4 sm:px-6 lg:px-10 py-5 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "#4F1E7B",
              boxShadow:
                "0 4px 14px -4px rgba(79, 30, 123 ,0.55), 0 0 0 1px rgba(255,255,255,0.22) inset",
            }}
          >
            <WirelineMark className="w-4 h-4 text-on-brand" strokeWidth={130} />
          </div>
          <span className="font-display italic text-xl text-ink">Wireline</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <Link
            to="/pricing"
            className="hidden sm:inline text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            Pricing
          </Link>
          <Link
            to="/compare"
            className="hidden sm:inline text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            Compare
          </Link>
          <Link
            to="/about"
            className="hidden md:inline text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            About
          </Link>
          <Link
            to="/"
            className="shrink-0 px-3 sm:px-4 py-2 rounded-full bg-brand text-on-brand text-[10px] sm:text-[11px] uppercase tracking-[0.16em] sm:tracking-[0.28em] hover:opacity-90 transition-opacity"
          >
            Start free trial
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 lg:px-10 pt-12 pb-12 sm:pt-20 sm:pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-4 font-medium">
            The playable showcase
          </p>
          <h1 className="font-display italic text-5xl sm:text-6xl leading-[1.05] tracking-tight text-ink text-balance mb-6">
            Audition the agents before you deploy one.
          </h1>
          <p className="text-base sm:text-lg text-ink/75 leading-relaxed max-w-2xl">
            Every template below is a real Wireline persona — same voice engine, same brain, same
            hand-off rules — packaged so you can hear it without picking up the phone. Click play to
            sample. Like what you hear? Spin up your own.
          </p>
        </motion.div>
      </section>

      {/* Showcase cards */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 lg:px-10 pb-20">
        <div className="flex items-center gap-2 mb-6">
          <Volume2 className="w-4 h-4 text-brand" strokeWidth={2.2} />
          <p className="text-[10px] uppercase tracking-[0.4em] text-brand font-medium">
            Press play
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5">
          {SHOWCASE_AGENTS.map((agent) => (
            <ShowcaseCard key={agent.tel} agent={agent} />
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 pb-24 text-center">
        <h2 className="font-display italic text-4xl sm:text-5xl text-ink mb-4 text-balance">
          Deploy your own in under a minute.
        </h2>
        <p className="text-sm sm:text-base text-ink/70 max-w-xl mx-auto mb-6 leading-relaxed">
          Pick a voice. Drop a knowledge base. Wireline writes the system prompt + first-message for
          you. Live in production with a real number, 14-day free trial, no credit card.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
          >
            Start free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/compare"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full glass border border-black/12 text-ink text-[11px] uppercase tracking-[0.3em] font-medium hover:border-brand/40 transition-all"
          >
            Compare vs competitors
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-black/8 py-8 px-6 lg:px-10 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-muted/60">
          <Link to="/" className="hover:text-ink transition-colors">
            Wireline
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/pricing" className="hover:text-ink transition-colors">
            Pricing
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/compare" className="hover:text-ink transition-colors">
            Compare
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/about" className="hover:text-ink transition-colors">
            About
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/privacy" className="hover:text-ink transition-colors">
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms" className="hover:text-ink transition-colors">
            Terms
          </Link>
        </div>
      </footer>
    </div>
  );
}
