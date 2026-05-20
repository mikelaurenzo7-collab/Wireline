/**
 * /compare — feature matrix vs the obvious competitors.
 *
 * Honest scoring: a 9-0 sweep signals immaturity. Wireline wins on
 * breadth + horizontal platform; competitors win on niches (Air =
 * cheap for pure outbound, Vapi-direct = lower abstraction for
 * developers who want to compose their own stack). Saying that out
 * loud reads as confident, not defensive.
 *
 * Strategic context: investors + buyers researching the space land
 * here from organic search or DM links. They want a single page
 * that explains "why Wireline vs the rest" without sales fluff.
 */
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Check, X, Minus, ArrowRight } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import WirelineMark from "../components/WirelineMark";

type Cell = true | false | "partial";

interface Row {
  feature: string;
  detail: string;
  wireline: Cell;
  air: Cell;
  synthflow: Cell;
  bland: Cell;
  vapi: Cell;
  retell: Cell;
}

const ROWS: Row[] = [
  {
    feature: "Voice + SMS + Email in one console",
    detail:
      "One inbox for every channel the customer reaches you on, with cross-channel context shared between agents.",
    wireline: true,
    air: false,
    synthflow: false,
    bland: false,
    vapi: false,
    retell: false,
  },
  {
    feature: "Supervisor cockpit (live coach + take-over)",
    detail:
      "Listen to live calls, see real-time transcripts, pause the agent and inject corrections without ending the call.",
    wireline: true,
    air: false,
    synthflow: "partial",
    bland: false,
    vapi: "partial",
    retell: "partial",
  },
  {
    feature: "Draft-vs-auto autonomy intent",
    detail:
      "Per-agent autonomy level (Draft / Supervised / Full Auto). Tools either run immediately or queue for human approval.",
    wireline: true,
    air: false,
    synthflow: false,
    bland: false,
    vapi: false,
    retell: false,
  },
  {
    feature: "Frontier reasoning model on every agent",
    detail:
      "Best-in-class LLM stack tuned for high-stakes conversation. Competitors default to mid-tier models for cost; Wireline doesn't compromise on reasoning quality.",
    wireline: true,
    air: false,
    synthflow: false,
    bland: false,
    vapi: "partial",
    retell: "partial",
  },
  {
    feature: "White-label phone numbers included",
    detail:
      "Every plan includes a dedicated voice number with no separate carrier bill. Customer never sees infra.",
    wireline: true,
    air: "partial",
    synthflow: "partial",
    bland: "partial",
    vapi: false,
    retell: false,
  },
  {
    feature: "TCPA compliance ledger",
    detail:
      "Every disclosure + opt-out logged with rule version + state. Auditable on demand. Not a black-box service.",
    wireline: true,
    air: "partial",
    synthflow: false,
    bland: false,
    vapi: false,
    retell: false,
  },
  {
    feature: "10+ CRM / messaging / ads integrations",
    detail:
      "HubSpot, Salesforce, Slack, Zoom, Apollo, Meta Lead Ads, Google Workspace, Microsoft 365, Yahoo Mail, DocuSign.",
    wireline: true,
    air: "partial",
    synthflow: "partial",
    bland: false,
    vapi: false,
    retell: "partial",
  },
  {
    feature: "Per-tenant agent tailoring",
    detail:
      "Per-agent personality, directives, knowledge, voice config, flow composer, and integration scope. No generic personas.",
    wireline: true,
    air: "partial",
    synthflow: "partial",
    bland: "partial",
    vapi: "partial",
    retell: "partial",
  },
  {
    feature: "AI-generated agent forge",
    detail:
      "One sentence in, full agent out — name, archetype, first message, personality, directives, knowledge seeds.",
    wireline: true,
    air: false,
    synthflow: false,
    bland: false,
    vapi: false,
    retell: false,
  },
];

function CellGlyph({ value }: { value: Cell }) {
  if (value === true) return <Check className="w-4 h-4 text-emerald-500" strokeWidth={2.6} />;
  if (value === "partial") return <Minus className="w-4 h-4 text-amber-500" strokeWidth={2.6} />;
  return <X className="w-4 h-4 text-rose-400/70" strokeWidth={2.4} />;
}

const COMPETITORS: { key: keyof Omit<Row, "feature" | "detail">; label: string; note?: string }[] =
  [
    { key: "wireline", label: "Wireline" },
    { key: "air", label: "Air", note: "Cheaper for pure outbound" },
    { key: "synthflow", label: "Synthflow" },
    { key: "bland", label: "Bland" },
    { key: "vapi", label: "Vapi (direct)", note: "Lower abstraction for devs" },
    { key: "retell", label: "Retell" },
  ];

export default function Compare() {
  const score = (key: keyof Omit<Row, "feature" | "detail">) =>
    ROWS.reduce((n, r) => n + (r[key] === true ? 1 : r[key] === "partial" ? 0.5 : 0), 0);

  return (
    <div className="min-h-screen relative bg-paper text-ink">
      <PageMeta
        title="Wireline vs Air / Synthflow / Bland / Vapi / Retell — Feature Comparison"
        description="Side-by-side comparison of Wireline against the leading AI voice agent platforms. Wireline is the only horizontal platform with voice + email + SMS, supervisor cockpit, frontier reasoning, and bundled phone numbers."
      />

      {/* Aurora backdrop — same restrained palette as the wedge pages. */}
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
            background: "radial-gradient(circle, rgba(79, 30, 123 ,0.10), transparent 65%)",
          }}
          animate={{ x: [0, -25, 0], y: [0, 25, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Top brand bar */}
      <header className="relative z-10 px-4 sm:px-6 lg:px-10 xl:px-14 py-5 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5">
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
        <div className="flex items-center gap-3">
          <Link
            to="/pricing"
            className="text-[11px] uppercase tracking-[0.3em] text-muted/70 hover:text-ink transition-colors"
          >
            Pricing
          </Link>
          <Link
            to="/"
            className="px-4 py-2 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.28em] hover:opacity-90 transition-opacity"
          >
            Start free trial
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pt-12 pb-12 sm:pt-16 sm:pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-[10px] uppercase tracking-[0.4em] text-brand mb-4 font-medium">
            How Wireline compares
          </p>
          <h1 className="font-display italic text-5xl sm:text-6xl leading-[1.05] tracking-tight text-ink text-balance mb-5">
            Honest scoring vs every voice-AI platform.
          </h1>
          <p className="text-base sm:text-lg text-ink/75 max-w-2xl leading-relaxed">
            Wireline is the only horizontal platform that runs voice + SMS + email in one console
            with supervisor cockpit, frontier reasoning, white-label numbers, and a real TCPA
            ledger. Competitors win on niches — Air is cheaper for pure outbound, Vapi gives
            developers lower-level control. Here's the full picture.
          </p>
        </motion.div>
      </section>

      {/* Matrix */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-20">
        {/* Mobile scroll affordance — the table is wider than 360-390px
            viewports by design (6 competitor columns need readable
            widths). Without this hint, mobile visitors think the table
            is broken instead of pannable. */}
        <p className="md:hidden text-[11px] sm:text-[10px] uppercase tracking-[0.3em] text-muted/55 mb-2 flex items-center gap-1.5">
          <span aria-hidden="true">←</span>
          Pan to compare
          <span aria-hidden="true">→</span>
        </p>
        <div className="overflow-x-auto rounded-3xl glass border border-white/12 snap-x snap-mandatory scroll-smooth scrollbar-hide">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-4 pl-6 text-[10px] uppercase tracking-[0.3em] text-muted/70 font-medium w-64">
                  Capability
                </th>
                {COMPETITORS.map((c) => (
                  <th
                    key={c.key}
                    className={`p-3 text-center snap-start ${
                      c.key === "wireline" ? "bg-brand/8" : ""
                    }`}
                  >
                    <div
                      className={`text-[11px] uppercase tracking-[0.25em] font-semibold ${
                        c.key === "wireline" ? "text-brand" : "text-muted"
                      }`}
                    >
                      {c.label}
                    </div>
                    {c.note && (
                      <div className="text-[9px] text-muted/55 mt-1 leading-tight">{c.note}</div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr
                  key={row.feature}
                  className={`border-b border-white/8 ${i % 2 === 0 ? "bg-black/3" : ""}`}
                >
                  <td className="p-4 pl-6 align-top">
                    <p className="text-[13px] text-ink font-medium leading-snug">{row.feature}</p>
                    <p className="text-[11px] text-muted/75 mt-1 leading-relaxed">{row.detail}</p>
                  </td>
                  {COMPETITORS.map((c) => (
                    <td
                      key={c.key}
                      className={`p-3 text-center align-middle ${
                        c.key === "wireline" ? "bg-brand/8" : ""
                      }`}
                    >
                      <div className="inline-flex">
                        <CellGlyph value={row[c.key]} />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-brand/30">
                <td className="p-4 pl-6 text-[10px] uppercase tracking-[0.3em] text-muted/70 font-medium">
                  Score (out of {ROWS.length})
                </td>
                {COMPETITORS.map((c) => (
                  <td
                    key={c.key}
                    className={`p-3 text-center font-display italic text-xl ${
                      c.key === "wireline" ? "bg-brand/12 text-brand" : "text-muted"
                    }`}
                  >
                    {score(c.key)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted/55 mt-3 leading-relaxed">
          <Check className="w-3 h-3 text-emerald-500 inline-block mr-1" /> fully shipped
          &nbsp;·&nbsp;
          <Minus className="w-3 h-3 text-amber-500 inline-block mr-1" /> partial / limited
          &nbsp;·&nbsp;
          <X className="w-3 h-3 text-rose-400/70 inline-block mr-1" /> not available. Scoring
          reflects publicly-available product as of May 2026. Competitors' product surfaces change
          frequently — corrections welcome at trywireline@yahoo.com.
        </p>
      </section>

      {/* When the competitor wins */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-16">
        <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-6 text-balance">
          When a competitor is the better pick.
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl glass border border-white/10 p-5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-600 mb-2 font-medium">
              Pick Air if
            </p>
            <p className="text-sm text-ink/85 leading-relaxed">
              You only need <em>outbound</em> voice and want the cheapest per-minute rate. Air is a
              specialized outbound dialer; if you don't care about inbound, SMS, email, or
              supervisor coaching, Air's pricing wins.
            </p>
          </div>
          <div className="rounded-2xl glass border border-white/10 p-5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-600 mb-2 font-medium">
              Pick Vapi (direct) if
            </p>
            <p className="text-sm text-ink/85 leading-relaxed">
              You're a developer building your own voice-agent product on top of an infra layer.
              Vapi gives you primitives; Wireline IS the product. Use Vapi if you want to compose
              your own — use Wireline if you want a working platform.
            </p>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 pb-24 text-center">
        <h2 className="font-display italic text-4xl sm:text-5xl text-ink mb-4 text-balance">
          See Wireline running on a real call.
        </h2>
        <p className="text-sm sm:text-base text-ink/70 max-w-xl mx-auto mb-6 leading-relaxed">
          Call our demo line (630) 581-1834 to hear Liam answer in real time. Or start your 14-day
          free trial — phone number included, no credit card.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-brand text-on-brand text-[11px] uppercase tracking-[0.3em] font-medium hover:opacity-90 transition-all"
          >
            Start free trial
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="tel:+16305811834"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full glass border border-black/12 text-ink text-[11px] uppercase tracking-[0.3em] font-medium hover:border-brand/40 transition-all"
          >
            Call demo line
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-black/8 py-8 px-4 sm:px-6 lg:px-10 xl:px-14 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-muted/60">
          <Link to="/" className="hover:text-ink transition-colors">
            Wireline
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/pricing" className="hover:text-ink transition-colors">
            Pricing
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
