import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import "../styles/commercial-spot.css";

/**
 * Wireline — Big-Game Spot 001 ("The One That Got Away")
 *
 * A self-contained, timeline-driven 60-second animated web commercial.
 * Bold / humorous tone, on-brand with the launch source of truth:
 *   - Spine: Build -> Train -> Launch -> Improve
 *   - Line:  Voice agents that get the work done.
 *   - Offer: Build free. Go live from $19/mo.
 *
 * No fabricated customer proof, logos, or metrics — the "$" counter is an
 * explicitly illustrative cost-of-missed-calls gag, not a product claim.
 */

const DURATION = 60;

type Scene = {
  id: string;
  start: number;
  end: number;
  chapter: string;
};

const SCENES: Scene[] = [
  { id: "cold", start: 0, end: 5, chapter: "Cold open" },
  { id: "missed", start: 5, end: 13, chapter: "Missed calls" },
  { id: "punch", start: 13, end: 17, chapter: "The gut punch" },
  { id: "hero", start: 17, end: 24, chapter: "It picks up" },
  { id: "loop", start: 24, end: 34, chapter: "The loop" },
  { id: "jokes", start: 34, end: 45, chapter: "No excuses" },
  { id: "channels", start: 45, end: 52, chapter: "Every channel" },
  { id: "offer", start: 52, end: 57, chapter: "The offer" },
  { id: "logo", start: 57, end: 60, chapter: "Lockup" },
];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const easeOut = (n: number) => 1 - Math.pow(1 - n, 3);

function fmt(t: number) {
  const s = Math.max(0, Math.min(DURATION, Math.floor(t)));
  return `0:${String(s).padStart(2, "0")}`;
}

/* ---------------- Icons (functional UI only) ---------------- */
const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const IconPause = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </svg>
);
const IconReplay = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </svg>
);
const IconSoundOn = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
    <path d="M19 6a8 8 0 0 1 0 12" />
  </svg>
);
const IconSoundOff = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M11 5 6 9H3v6h3l5 4z" />
    <path d="m22 9-6 6M16 9l6 6" />
  </svg>
);
const IconPhone = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  </svg>
);
const IconArrow = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/* ---------------- Minimal Web Audio sound design ---------------- */
class SpotAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ring: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  private pad: { osc: OscillatorNode[]; gain: GainNode } | null = null;

  private ensure() {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  async resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  startRing() {
    this.ensure();
    if (!this.ctx || !this.master || this.ring) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    o1.type = "sine";
    o2.type = "sine";
    o1.frequency.value = 440;
    o2.frequency.value = 480;
    o1.connect(gain);
    o2.connect(gain);
    o1.start();
    o2.start();
    // North-American style ring cadence: 2s on, 4s off (compressed to 2s/1s).
    const now = this.ctx.currentTime;
    for (let i = 0; i < 12; i++) {
      const t = now + i * 3;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.28, t + 0.05);
      gain.gain.setValueAtTime(0.28, t + 1.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.95);
    }
    this.ring = { osc: [o1, o2], gain };
  }

  stopRing() {
    if (!this.ring || !this.ctx) return;
    const { osc, gain } = this.ring;
    gain.gain.cancelScheduledValues(this.ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.1);
    osc.forEach((o) => {
      try {
        o.stop(this.ctx!.currentTime + 0.15);
      } catch {
        /* ignore */
      }
    });
    this.ring = null;
  }

  whoosh() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    gain.connect(this.master);
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.5);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.75);
  }

  startPad() {
    this.ensure();
    if (!this.ctx || !this.master || this.pad) return;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, this.ctx.currentTime + 1.2);
    gain.connect(this.master);
    const freqs = [110, 165, 220];
    const osc = freqs.map((f) => {
      const o = this.ctx!.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.connect(gain);
      o.start();
      return o;
    });
    this.pad = { osc, gain };
  }

  stopPad() {
    if (!this.pad || !this.ctx) return;
    const { osc, gain } = this.pad;
    gain.gain.cancelScheduledValues(this.ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.4);
    osc.forEach((o) => {
      try {
        o.stop(this.ctx!.currentTime + 0.5);
      } catch {
        /* ignore */
      }
    });
    this.pad = null;
  }

  blip() {
    this.ensure();
    if (!this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    gain.connect(this.master);
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(660, now);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  silenceAll() {
    this.stopRing();
    this.stopPad();
  }

  close() {
    this.silenceAll();
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

/* ---------------- Scene renderer ---------------- */
function SceneView({ scene, p }: { scene: Scene; p: number }) {
  switch (scene.id) {
    case "cold":
      return (
        <div className="spot-scene">
          <div className="spot-ripple" />
          <div className="spot-phone">
            <IconPhone />
          </div>
          <div className="spot-kicker spot-up">Tuesday // 2:47 PM</div>
          <h2 className="spot-head spot-up-2">
            Your best customer <span className="spot-wire">is calling.</span>
          </h2>
          <p className="spot-sub spot-up-3">
            You&apos;re on a ladder. Holding a drill. In a meeting.
          </p>
        </div>
      );

    case "missed": {
      const rows = [
        { who: "New lead — Maple St. reno", status: "Voicemail" },
        { who: "Repeat client, ready to book", status: "Voicemail" },
        { who: "$8k job. Wants to pay today", status: "Voicemail" },
        { who: "Called your competitor instead", status: "Gone" },
      ];
      const shown = Math.min(rows.length, Math.floor(p * (rows.length + 0.6)));
      const money = Math.round(easeOut(clamp01(p)) * 12480);
      return (
        <div className="spot-scene">
          <div className="spot-kicker spot-up">Meanwhile, the phone keeps ringing</div>
          <div className="spot-missed-list">
            {rows.map((r, i) => (
              <div
                key={r.who}
                className={`spot-missed-row ${i < shown ? "on" : ""}`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <span className="who">{r.who}</span>
                <span className="status">{r.status}</span>
              </div>
            ))}
          </div>
          <div className="spot-counter" style={{ marginTop: "3cqw" }}>
            ${money.toLocaleString()}
          </div>
          <div className="spot-counter-label">walked out the door — this week*</div>
        </div>
      );
    }

    case "punch":
      return (
        <div className="spot-scene">
          <h2 className="spot-head spot-head--xl spot-up">
            You can&apos;t <br />
            <span className="spot-err">clone yourself.</span>
          </h2>
          <p className="spot-sub spot-up-2">
            Believe us, we checked. So we built the next best thing.
          </p>
        </div>
      );

    case "hero":
      return (
        <div className="spot-scene">
          <div className="spot-wave" aria-hidden="true">
            {Array.from({ length: 13 }).map((_, i) => (
              <span
                key={i}
                style={{
                  height: "100%",
                  animationDelay: `${(i % 7) * 0.09}s`,
                  animationDuration: `${0.7 + (i % 4) * 0.12}s`,
                }}
              />
            ))}
          </div>
          <div className="spot-kicker spot-up">On the second ring</div>
          <h2 className="spot-head spot-up-2">
            A <span className="spot-accent">Wireline voice agent</span> picks up.
          </h2>
          <span className="spot-livechip spot-up-3">
            <span className="pulse" /> Live call · handling it
          </span>
        </div>
      );

    case "loop": {
      const steps = [
        { n: "01", t: "Build", d: "Spin up an agent and give it a job." },
        { n: "02", t: "Train", d: "Teach it your facts, rules, and voice." },
        { n: "03", t: "Launch", d: "Go live on the channels you enable." },
        { n: "04", t: "Improve", d: "Learn from real, logged outcomes." },
      ];
      const active = Math.min(3, Math.floor(p * 4.2));
      return (
        <div className="spot-scene">
          <div className="spot-kicker spot-up">The whole job, on repeat</div>
          <h2 className="spot-head spot-up-2" style={{ fontSize: "6.4cqw" }}>
            Build. Train. Launch. Improve.
          </h2>
          <div className="spot-loop">
            {steps.map((s, i) => (
              <div
                key={s.t}
                className={`spot-loop-step ${i === active ? "active" : ""} ${i < active ? "done" : ""}`}
              >
                <div className="n">{s.n}</div>
                <div className="t">{s.t}</div>
                <div className="d">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "jokes": {
      const jokes = [
        <>
          It doesn&apos;t take <span className="strike">lunch.</span>
        </>,
        <>
          It doesn&apos;t &quot;<span className="strike">circle back.</span>&quot;
        </>,
        <>
          It won&apos;t quit to start a <span className="strike">podcast.</span>
        </>,
      ];
      const shown = Math.min(jokes.length, Math.floor(p * 3.4) + 1);
      return (
        <div className="spot-scene">
          <div className="spot-jokes">
            {jokes.map((j, i) => (
              <div
                key={i}
                className={`spot-joke ${i < shown ? "on" : ""}`}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {j}
              </div>
            ))}
          </div>
          <p className="spot-sub spot-up" style={{ marginTop: "4cqw" }}>
            It just answers. Every time.
          </p>
        </div>
      );
    }

    case "channels": {
      const chans = ["Calls", "Texts", "Email", "Follow-up", "Logged outcomes"];
      const active = Math.min(chans.length, Math.floor(p * (chans.length + 1)));
      return (
        <div className="spot-scene">
          <div className="spot-kicker spot-up">One trained agent. Every channel.</div>
          <h2 className="spot-head spot-up-2" style={{ fontSize: "6.4cqw" }}>
            It doesn&apos;t just talk.
            <br />
            <span className="spot-accent">It gets the work done.</span>
          </h2>
          <div className="spot-chan">
            {chans.map((c, i) => (
              <span key={c} className={`spot-chan-chip ${i < active ? "on" : ""}`}>
                <span className="d" /> {c}
              </span>
            ))}
          </div>
        </div>
      );
    }

    case "offer":
      return (
        <div className="spot-scene">
          <div className="spot-kicker spot-up">Here&apos;s the wild part</div>
          <h2 className="spot-head spot-up-2" style={{ fontSize: "5.4cqw" }}>
            Build it free.
          </h2>
          <div className="spot-price spot-pop" style={{ marginTop: "1.5cqw" }}>
            $19<small>/mo to go live</small>
          </div>
        </div>
      );

    case "logo":
      return (
        <div className="spot-scene">
          <div className="spot-logo-mark spot-up">
            <span className="spot-wordmark">Wireline</span>
          </div>
          <div className="spot-underline" />
          <p
            className="spot-sub spot-up-2"
            style={{ marginTop: "2.4cqw", fontSize: "3cqw", color: "var(--text)" }}
          >
            Voice agents that get the work done.
          </p>
          <Link to="/get-started" className="spot-cta spot-up-3">
            Build your voice agent <IconArrow />
          </Link>
        </div>
      );

    default:
      return null;
  }
}

/* ---------------- Page ---------------- */
export default function CommercialSpot() {
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [sound, setSound] = useState(false);
  const [flashKey, setFlashKey] = useState(0);

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);
  const audioRef = useRef<SpotAudio | null>(null);
  const soundRef = useRef(false);
  const lastSceneRef = useRef<string>("");

  const activeScene = useMemo(() => {
    return SCENES.find((s) => elapsed >= s.start && elapsed < s.end) ?? SCENES[SCENES.length - 1];
  }, [elapsed]);

  const localProgress = useMemo(() => {
    return clamp01((elapsed - activeScene.start) / (activeScene.end - activeScene.start));
  }, [elapsed, activeScene]);

  // Animation clock
  useEffect(() => {
    if (!playing) {
      lastRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = (now: number) => {
      if (lastRef.current == null) lastRef.current = now;
      const dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      setElapsed((prev) => {
        const next = prev + dt;
        if (next >= DURATION) {
          setPlaying(false);
          return DURATION;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  // Sound design tied to the active scene
  useEffect(() => {
    const engine = audioRef.current;
    if (!engine) return;
    const id = activeScene.id;
    const changed = id !== lastSceneRef.current;
    lastSceneRef.current = id;
    if (!soundRef.current || !playing) return;

    if (id === "cold" || id === "missed") {
      engine.stopPad();
      engine.startRing();
    } else if (id === "punch") {
      engine.stopRing();
    } else if (id === "hero") {
      engine.stopRing();
      if (changed) engine.whoosh();
      engine.startPad();
    } else if (id === "jokes") {
      engine.startPad();
      if (changed) engine.blip();
    } else if (id === "logo") {
      if (changed) engine.blip();
      engine.startPad();
    } else {
      engine.startPad();
    }
  }, [activeScene, playing]);

  // Flash on the hard cut into the hero act
  useEffect(() => {
    if (activeScene.id === "hero" && localProgress < 0.1) {
      setFlashKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScene.id]);

  // Pause audio when not playing
  useEffect(() => {
    if (!playing) audioRef.current?.silenceAll();
  }, [playing]);

  // Cleanup
  useEffect(() => {
    audioRef.current = new SpotAudio();
    return () => {
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const start = useCallback(async (withSound: boolean) => {
    setStarted(true);
    setElapsed(0);
    if (withSound) {
      setSound(true);
      soundRef.current = true;
      await audioRef.current?.resume();
    }
    setPlaying(true);
  }, []);

  const togglePlay = useCallback(async () => {
    if (elapsed >= DURATION) {
      setElapsed(0);
      setPlaying(true);
      return;
    }
    if (!playing && sound) await audioRef.current?.resume();
    setPlaying((p) => !p);
  }, [elapsed, playing, sound]);

  const replay = useCallback(() => {
    setElapsed(0);
    setPlaying(true);
  }, []);

  const toggleSound = useCallback(async () => {
    const next = !sound;
    setSound(next);
    soundRef.current = next;
    if (next) {
      await audioRef.current?.resume();
    } else {
      audioRef.current?.silenceAll();
    }
  }, [sound]);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = clamp01((e.clientX - rect.left) / rect.width);
    setElapsed(ratio * DURATION);
  }, []);

  const fillPct = (elapsed / DURATION) * 100;
  const ended = elapsed >= DURATION;

  return (
    <main className="spot" aria-label="Wireline commercial spot">
      <div className="spot-frame">
        <div className="spot-stage">
          <div className="spot-hud spot-hud--tl">
            <span className="dot" /> REC · Spot 001
          </div>
          <div className="spot-hud spot-hud--tr">Wireline // :60</div>
          <div className="spot-hud spot-hud--bl">{activeScene.chapter}</div>

          {started && flashKey > 0 && <div key={flashKey} className="spot-flash" />}

          {started && (
            <div key={activeScene.id}>
              <SceneView scene={activeScene} p={localProgress} />
            </div>
          )}

          <div className="spot-vignette" />
          <div className="spot-scan" />
          <div className="spot-grain" />

          {/* Start / end overlay */}
          {(!started || ended) && (
            <div className="spot-overlay">
              {!started ? (
                <>
                  <div className="spot-overlay-sub">Wireline · Big-game spot</div>
                  <div className="spot-overlay-title">The one that got away.</div>
                  <button
                    className="spot-play-big"
                    onClick={() => start(true)}
                    aria-label="Play with sound"
                  >
                    <IconPlay />
                  </button>
                  <button
                    className="spot-exit"
                    onClick={() => start(false)}
                    style={{ border: "none", color: "var(--dim)" }}
                  >
                    or play muted
                  </button>
                </>
              ) : (
                <>
                  <div className="spot-overlay-sub">That&apos;s the spot</div>
                  <div className="spot-overlay-title">
                    Build free. Go live from <span className="spot-accent">$19/mo.</span>
                  </div>
                  <div style={{ display: "flex", gap: "2cqw", alignItems: "center" }}>
                    <button className="spot-play-big" onClick={replay} aria-label="Replay">
                      <IconReplay />
                    </button>
                  </div>
                  <Link to="/get-started" className="spot-cta">
                    Build your voice agent <IconArrow />
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="spot-controls">
        <button
          className="spot-btn spot-btn--primary"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <IconPause /> : <IconPlay />}
        </button>
        <button className="spot-btn" onClick={replay} aria-label="Restart">
          <IconReplay />
        </button>

        <div className="spot-chapter">{activeScene.chapter}</div>

        <div
          className="spot-track"
          onClick={seek}
          role="slider"
          aria-label="Timeline"
          aria-valuemin={0}
          aria-valuemax={DURATION}
          aria-valuenow={Math.round(elapsed)}
          tabIndex={0}
        >
          <div className="spot-track-rail">
            <div className="spot-track-fill" style={{ width: `${fillPct}%` }} />
          </div>
          {SCENES.slice(1).map((s) => (
            <span
              key={s.id}
              className="spot-tick"
              style={{ left: `${(s.start / DURATION) * 100}%` }}
              title={s.chapter}
            />
          ))}
        </div>

        <div className="spot-time">
          {fmt(elapsed)} / {fmt(DURATION)}
        </div>

        <button
          className="spot-btn"
          onClick={toggleSound}
          aria-label={sound ? "Mute" : "Unmute"}
          aria-pressed={sound}
        >
          {sound ? <IconSoundOn /> : <IconSoundOff />}
        </button>

        <Link to="/" className="spot-exit">
          Exit
        </Link>
      </div>
    </main>
  );
}
