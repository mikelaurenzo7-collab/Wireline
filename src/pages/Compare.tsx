/**
 * /compare — feature matrix vs the obvious competitors.
 *
 * Honest scoring: a 9-0 sweep signals immaturity. Wireline wins on
 * breadth + horizontal platform; competitors win on niches (Air =
 * cheap for pure outbound). Saying that out
 * loud reads as confident, not defensive.
 *
 * Strategic context: investors + buyers researching the space land
 * here from organic search or DM links. They want a single page
 * that explains "why Wireline vs the rest" without sales fluff.
 */
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Check, X, Minus, ArrowRight, Phone } from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingPageFrame from "../components/layout/MarketingPageFrame";

type Cell = true | false | "partial";

interface Row {
  feature: string;
  detail: string;
  wireline: Cell;
  air: Cell;
  synthflow: Cell;
  bland: Cell;
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
    retell: false,
  },
  {
    feature: "Tiered Claude stack for live calls + deep reasoning",
    detail:
      "Sonnet-class models handle live calls for speed and cadence; Opus-class reasoning powers briefs, coaching, review, and harder post-call analysis. The stack is tuned by task instead of flattened to the cheapest model.",
    wireline: true,
    air: false,
    synthflow: false,
    bland: false,
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
    retell: false,
  },
  {
    feature: "Operator console (not just an API)",
    detail:
      "Triage, fleet, integrations, compliance ledger, and supervisor cockpit ship as one product. No separate admin UI to build.",
    wireline: true,
    air: "partial",
    synthflow: "partial",
    bland: "partial",
    retell: "partial",
  },
  {
    feature: "Live-call latency controls",
    detail:
      "Capped parallel tool execution, trimmed assistant context, and tuned response delay so agents feel snappy on real PSTN lines — not just lab demos.",
    wireline: true,
    air: "partial",
    synthflow: false,
    bland: "partial",
    retell: "partial",
  },
  {
    feature: "Post-call enrichment (intent, commitments, QA)",
    detail:
      "Structured extraction after every call feeds triage, coaching, and the knowledge-gap queue — not a generic one-line summary.",
    wireline: true,
    air: false,
    synthflow: "partial",
    bland: "partial",
    retell: "partial",
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
    { key: "bland", label: "Bland", note: "Voice API + light UI" },
    { key: "retell", label: "Retell", note: "Strong voice dev UX" },
  ];

export default function Compare() {
  const score = (key: keyof Omit<Row, "feature" | "detail">) =>
    ROWS.reduce((n, r) => n + (r[key] === true ? 1 : r[key] === "partial" ? 0.5 : 0), 0);

  return (
    <>
      <PageMeta
        title="Wireline vs Air / Synthflow / Bland / Retell — Feature Comparison"
        description="Side-by-side comparison of Wireline against the leading AI voice agent platforms. Wireline is the only horizontal platform with voice + email + SMS, supervisor cockpit, frontier reasoning, and bundled phone numbers."
        path="/compare"
      />

      <MarketingPageFrame mainClassName="!px-0 pt-20 sm:pt-24">
        {/* Hero */}
        <section className="relative z-10 max-w-6xl mx-auto pt-4 pb-12 sm:pt-8 sm:pb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink/65 mb-4">
              How Wireline compares
            </p>
            <h1 className="marketing-hero-title mb-5">
              Honest scoring vs every voice-AI platform.
            </h1>
            <p className="marketing-hero-lead mx-auto">
              Wireline is the horizontal platform that runs voice + SMS + email in one console with
              supervisor cockpit, frontier reasoning, white-label numbers, and a real TCPA ledger.
              Bland and Retell are excellent if you mainly want a voice API with a thin dashboard;
              Air still wins on pure outbound price. Here's the full picture.
            </p>
          </motion.div>
        </section>

        {/* Matrix */}
        <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-20">
          {/* Mobile scroll affordance — the table is wider than 360-390px
            viewports by design (6 competitor columns need readable
            widths). Without this hint, mobile visitors think the table
            is broken instead of pannable. */}
          <p className="md:hidden font-mono text-[11px] sm:text-[10px] uppercase tracking-[0.3em] text-ink/55 mb-2 flex items-center gap-1.5">
            <span aria-hidden="true">←</span>
            Pan to compare
            <span aria-hidden="true">→</span>
          </p>
          <div className="overflow-x-auto glass border border-ink/[0.1] snap-x snap-mandatory scroll-smooth scrollbar-hide">
            <table className="w-full min-w-[720px]" aria-describedby="compare-legend">
              <caption className="sr-only">
                Feature comparison of Wireline versus Air, Synthflow, Bland, and Retell
              </caption>
              <thead>
                <tr className="border-b border-ink/[0.12]">
                  <th className="text-left p-4 pl-6 font-mono text-[10px] uppercase tracking-[0.3em] text-ink/55 font-medium w-64">
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
                        className={`font-mono text-[11px] uppercase tracking-[0.25em] font-semibold ${
                          c.key === "wireline" ? "text-brand" : "text-ink/65"
                        }`}
                      >
                        {c.label}
                      </div>
                      {c.note && (
                        <div className="text-[9px] text-ink/50 mt-1 leading-tight">{c.note}</div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-ink/[0.08] transition-colors duration-200 hover:bg-brand/[0.04] ${
                      i % 2 === 0 ? "bg-ink/[0.02]" : ""
                    }`}
                  >
                    <td className="p-4 pl-6 align-top">
                      <p className="text-[13px] text-ink font-medium leading-snug">{row.feature}</p>
                      <p className="text-[11px] text-ink/60 mt-1 leading-relaxed">{row.detail}</p>
                      {row.feature.includes("integrations") && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {["HubSpot", "Salesforce", "Slack", "Zoom", "Apollo", "Meta"].map((b) => (
                            <span
                              key={b}
                              className="px-1.5 py-0.5 bg-brand/[0.06] border border-brand/15 text-brand font-mono text-[9px] uppercase tracking-[0.2em]"
                            >
                              {b}
                            </span>
                          ))}
                          <span className="px-1.5 py-0.5 bg-ink/[0.03] border border-ink/10 text-ink/55 font-mono text-[9px] uppercase tracking-[0.2em]">
                            + 4 more
                          </span>
                        </div>
                      )}
                    </td>
                    {COMPETITORS.map((c) => (
                      <td
                        key={c.key}
                        aria-label={`${c.label}: ${row[c.key] === true ? "yes" : row[c.key] === "partial" ? "partial" : "no"}`}
                        className={`p-3 text-center align-middle ${
                          c.key === "wireline" ? "bg-brand/8" : ""
                        }`}
                      >
                        <div className="inline-flex" aria-hidden="true">
                          <CellGlyph value={row[c.key]} />
                        </div>
                        <span className="sr-only">
                          {row[c.key] === true
                            ? "Yes"
                            : row[c.key] === "partial"
                              ? "Partial"
                              : "No"}
                        </span>
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
          <p id="compare-legend" className="text-[10px] text-ink/55 mt-3 leading-relaxed">
            <Check className="w-3 h-3 text-emerald-500 inline-block mr-1" aria-hidden /> fully
            shipped &nbsp;·&nbsp;
            <Minus className="w-3 h-3 text-amber-500 inline-block mr-1" /> partial / limited
            &nbsp;·&nbsp;
            <X className="w-3 h-3 text-rose-400/70 inline-block mr-1" /> not available. Scoring
            reflects publicly-available product as of May 2026. Competitors' product surfaces change
            frequently — corrections welcome at trywireline@yahoo.com.
          </p>
        </section>

        {/* Pricing Transparency */}
        <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-16 text-center">
          <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-3">
            Transparent, flat-rate pricing.
          </h2>
          <p className="text-sm sm:text-base text-ink/65 max-w-2xl mx-auto mb-8 leading-relaxed">
            No hidden telephony markups. No complex token math. You pay a flat rate for access to
            the platform and standard pass-through for frontier LLM usage.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-ink/[0.08] border border-ink/[0.08] text-left">
            <div className="bg-paper p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-600 mb-1.5">
                Included
              </p>
              <p className="text-xl font-display italic text-ink mb-2">Dedicated Numbers</p>
              <p className="text-xs text-ink/65 leading-relaxed">
                Every plan includes dedicated voice numbers. No Twilio bill required.
              </p>
            </div>
            <div className="bg-paper p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand mb-1.5">
                Pass-through
              </p>
              <p className="text-xl font-display italic text-ink mb-2">Frontier LLMs</p>
              <p className="text-xs text-ink/65 leading-relaxed">
                We never mark up OpenAI or Anthropic tokens. You pay exactly what they charge.
              </p>
            </div>
            <div className="bg-paper p-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink/55 mb-1.5">
                Flexible growth
              </p>
              <p className="text-xl font-display italic text-ink mb-2">Agents by tier</p>
              <p className="text-xs text-ink/65 leading-relaxed">
                Every plan includes a clear agent cap, with à-la-carte add-ons when you need more
                specialists.
              </p>
            </div>
          </div>
        </section>

        {/* When the competitor wins */}
        <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-14 pb-16">
          <h2 className="font-display italic text-3xl sm:text-4xl text-ink mb-6 text-balance">
            When a competitor is the better pick.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass border border-ink/[0.08] p-5 transition-all duration-300 hover:border-brand/30">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-600 mb-2">
                Pick Air if
              </p>
              <p className="text-sm text-ink/80 leading-relaxed">
                You only need <em>outbound</em> voice and want the cheapest per-minute rate. Air is
                a specialized outbound dialer; if you don't care about inbound, SMS, email, or
                supervisor coaching, Air's pricing wins.
              </p>
            </div>
            <div className="glass border border-ink/[0.08] p-5 transition-all duration-300 hover:border-brand/30">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-600 mb-2">
                Pick Bland if
              </p>
              <p className="text-sm text-ink/80 leading-relaxed">
                Your team wants a straightforward voice API with quick path-to-demo and you will
                wire CRM + compliance yourself. Bland is strong on call placement and developer
                docs; it is not a full operator console with TCPA ledger, email agents, or
                supervisor take-over.
              </p>
            </div>
            <div className="glass border border-ink/[0.08] p-5 transition-all duration-300 hover:border-brand/30">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-600 mb-2">
                Pick Retell if
              </p>
              <p className="text-sm text-ink/80 leading-relaxed">
                You are shipping a voice-first product and want polished SDKs, latency tuning, and
                agent builder UX without building a marketing console. Retell does not bundle
                multi-channel inbox, white-label numbers, or horizontal compliance the way Wireline
                does.
              </p>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="relative z-10 max-w-3xl mx-auto px-6 lg:px-10 pb-24 text-center">
          <h2 className="font-display italic text-4xl sm:text-5xl text-ink mb-4 text-balance">
            See Wireline running on a real call.
          </h2>
          <p className="text-sm sm:text-base text-ink/65 max-w-xl mx-auto mb-6 leading-relaxed">
            Call our demo line (630) 581-1834 to hear Liam answer in real time. Or start your 14-day
            free trial — phone number included, no credit card.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/signup"
              className="inline-flex items-center gap-2.5 bg-brand text-white font-medium text-sm px-7 py-3.5 hover:bg-[#8B3FD6] transition-colors duration-300"
            >
              Start free trial
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="tel:+16305811834"
              className="inline-flex items-center gap-2 border border-ink/15 text-ink font-medium text-sm px-7 py-3.5 hover:border-brand/30 hover:text-brand transition-colors duration-300"
            >
              <Phone className="w-4 h-4" />
              Call demo line
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className="relative z-10 border-t border-black/8 py-8 px-4 sm:px-6 lg:px-10 xl:px-14 max-w-6xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-muted/70">
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
      </MarketingPageFrame>
    </>
  );
}
