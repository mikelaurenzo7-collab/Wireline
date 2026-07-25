/**
 * Security.tsx — public-facing security & compliance page at /security.
 *
 * Discoverable from the TrustSignals strip + the homepage footer.
 * Documents — honestly — what Wireline ships in production today and
 * what's on the certification roadmap.
 *
 * Hard rule: no fabrication. "SOC 2 Type II in progress" stays in
 * progress until the audit is real; "HIPAA compliant" stays "HIPAA
 * controls implemented" until BAA + audit are signed.
 */
import { motion } from "motion/react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  KeyRound,
  HeartPulse,
  CreditCard,
  Globe2,
  Eye,
  ServerCog,
  Database,
  BugPlay,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingChrome from "./marketing/MarketingChrome";

const SECTIONS = [
  {
    icon: Lock,
    title: "Encryption — everywhere",
    items: [
      "TLS 1.3 enforced on every public endpoint. HSTS preload-eligible.",
      "Passwords hashed with scrypt (N=16384, r=8, p=1) + per-user salt. Never stored in plaintext, never logged.",
      "Password-reset + email-verification tokens stored as SHA-256 hashes; plaintext exists only inside the email link.",
      "Session JWTs signed HS256 with a 256-bit rotated secret, delivered in an httpOnly SameSite=Lax cookie (2h TTL). Mutating API calls are Origin-checked; cross-site form posts cannot ride the session.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Strict browser security headers",
    items: [
      "Content-Security-Policy: explicit allowlist; no unsafe-eval. Blocks classic XSS at the browser layer.",
      "Cross-Origin-Opener-Policy: same-origin-allow-popups. Restricts opener relationships while preserving user-initiated OAuth connections.",
      "Cross-Origin-Resource-Policy: same-origin where appropriate. Defends against Spectre-class leaks.",
      "Referrer-Policy: strict-origin-when-cross-origin. Permissions-Policy: locked to what we use.",
    ],
  },
  {
    icon: KeyRound,
    title: "Webhook signature verification",
    items: [
      "Every inbound webhook — voice, messaging, and billing — is verified with HMAC + timingSafeEqual.",
      "Failed signatures return 401 and log the IP. Replay attacks return 401 (timestamp tolerance enforced).",
      "Outbound webhooks (when added) sign with the same primitives. No shared secrets in URLs.",
    ],
  },
  {
    icon: Eye,
    title: "What we do — and don't — store",
    items: [
      "Call transcripts: stored encrypted at rest, retention configurable per tenant (default 90 days).",
      "Audio recordings: stored only when the tenant explicitly opts in. Default OFF.",
      "Credit card numbers: never stored, never logged, never even read by our servers. PCI scope reduced via Stripe Elements.",
      "PHI (in HIPAA mode): never logged. Probing/debugging endpoints are PHI-aware and redact before display.",
    ],
  },
  {
    icon: HeartPulse,
    title: "HIPAA — controls implemented",
    items: [
      "Per-agent compliance_mode = 'hipaa' switches the runtime into PHI-aware behavior (no verification of identity in chat, no PHI in logs, default-deny on data export).",
      "BAA available on Enterprise onboarding only; Pro can use HIPAA-style guardrails, but PHI workflows require the Enterprise BAA path.",
      "Audit: SOC 2 Type II certification is on the 2026 Q4 roadmap. Until then, controls are implemented but not externally attested — we'd rather be honest about that than badge it.",
    ],
  },
  {
    icon: CreditCard,
    title: "PCI DSS — out of scope",
    items: [
      "Wireline never touches card data. Payments are processed via Stripe with PCI-DSS Level 1 scope reduction (Stripe Elements + Checkout).",
      "We hold tokenized customer references only.",
    ],
  },
  {
    icon: Globe2,
    title: "GDPR + CCPA",
    items: [
      "Right-to-erasure cascade-deletes every row tied to a user (agents, calls, knowledge, audit log).",
      "Data Processing Addendum available on request.",
      "Data residency: today, US-East. EU residency on the 2026 roadmap.",
    ],
  },
  {
    icon: ServerCog,
    title: "Operational security",
    items: [
      "Rate limiting on every public endpoint (signup, login, OAuth callbacks, webhooks).",
      "Idempotent database migrations — every schema change uses ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS.",
      "Public health probe at /status — uptime, per-tier model availability, cached 60 s. No private model names leaked.",
      "Every LLM call records (provider, model, tokens, cost, latency) into an immutable audit log.",
    ],
  },
  {
    icon: Database,
    title: "Database posture",
    items: [
      "Postgres on Supabase (US-East). Tenant isolation uses SET LOCAL ROLE wireline_server with per-request app.current_user_id RLS policies on tenant tables.",
      "Foreign keys CASCADE delete from user → all downstream rows in one transaction.",
      "Nightly snapshots; point-in-time recovery within 24 h. Tested quarterly.",
    ],
  },
  {
    icon: BugPlay,
    title: "Responsible disclosure",
    items: [
      "Found a vulnerability? Email security@trywireline.com with details and we'll respond within one business day.",
      "We don't (yet) run a paid bug bounty, but contributors who report real issues will be credited and rewarded.",
      "Please do not test exploits against tenant data; use your own Free Builder account.",
    ],
  },
];

const TRUST_PACK_SECTIONS = [
  {
    icon: ShieldCheck,
    title: "Tenant isolation",
    items: [
      "Every read and write is scoped to the authenticated account via server-side tenant context — not client-side filters.",
      "Provider credentials, OAuth tokens, and billing authority never ship to browsers or mobile clients.",
      "Cross-tenant access attempts are rejected at the API boundary and logged for review.",
    ],
  },
  {
    icon: Globe2,
    title: "Wireline Command (browser extension)",
    items: [
      "Early access handoff only — install from Apps in Studio; store listings are not GA.",
      "Page context is sent only when you explicitly click Send to Studio — no background harvesting.",
      "No broad host permissions, no silent browsing collection, and no auth tokens stored in the extension.",
    ],
  },
  {
    icon: ServerCog,
    title: "Native mobile clients",
    items: [
      "Optional companions — Android is internal beta; iPhone is planned. The web app is the GA product.",
      "When available, natives use short-lived Bearer sessions against the same API; prompts, billing, and compliance stay server-owned.",
      "App Store / Play account-deletion paths ship with each store build — they are not a launch gate for the web product.",
    ],
  },
  {
    icon: HeartPulse,
    title: "Call compliance (TCPA / DNC)",
    items: [
      "Outbound calls require consent checks before dial — marketing calls respect do-not-call posture.",
      "Tenant DNC lists are enforced before expensive PSTN actions.",
      "Marketing and campaign outbound fail closed until Federal DNC scrub is enabled. Studio non-marketing dials still use tenant DNC + TCPA. Operators: register the business, obtain a DNCScrub loginId, then set FEDERAL_DNC_API_URL + FEDERAL_DNC_API_KEY.",
    ],
  },
  {
    icon: CreditCard,
    title: "Billing & spend controls",
    items: [
      "Runtime Balance is a prepaid ledger — paid plans draw overflow voice and SMS from funded balance after included minutes. Free Builder cannot run live voice until a paid plan is active.",
      "Every paid plan draws extra voice, SMS, and enrichment from prepaid Runtime Balance with visible rates; active calls finish, and the next action pauses if coverage is depleted.",
      "Daily spend accumulators and economics-at-risk alerts help the platform owner catch margin leaks early.",
    ],
  },
  {
    icon: Eye,
    title: "Account deletion & data rights",
    items: [
      "Self-serve account deletion cascades user-owned rows (agents, calls, knowledge, audit events) in one server workflow.",
      "GDPR/CCPA erasure requests follow the same cascade — email security@trywireline.com for DPA copies.",
      "Transcript and recording retention honor per-tenant settings; recording defaults to off.",
    ],
  },
  {
    icon: Database,
    title: "Subprocessors & vendors",
    items: [
      "Production voice: approved telephony and voice orchestration partners (configured server-side only).",
      "Payments: Stripe (PCI scope reduced — Wireline never stores card numbers).",
      "Data plane: Supabase Postgres (US-East today). Email: Resend. Rate limits: Upstash Redis.",
      "Customer-facing surfaces use Wireline-owned copy — vendor names stay in operator configuration, not buyer UI.",
    ],
  },
];

const SECURITY_SUMMARY = [
  ["Runtime", "Encrypted transport, webhook verification, fallback voice path, and public probes."],
  ["Data", "Tenant-scoped access, encrypted transcripts, opt-in recordings, deletion workflow."],
  ["Compliance", "TCPA/DNC controls, HIPAA guardrails, SOC 2 roadmap stated without fake badges."],
  ["Billing", "Stripe card handling, prepaid Runtime Balance, and spend controls."],
] as const;

export default function Security() {
  const location = useLocation();
  const isTrustHub = location.pathname === "/trust";

  return (
    <>
      <PageMeta
        title={isTrustHub ? "Trust Center — Wireline" : "Security & Compliance — Wireline"}
        description="How Wireline handles encryption, tenant isolation, browser privacy, call compliance, billing safety, and honest security proof."
        // /trust and /security render identical content; consolidate both onto a
        // single canonical so search engines don't see competing duplicates.
        path="/security"
      />
      <MarketingChrome stickyCta={false}>
        <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 py-8 sm:py-12">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-caption font-medium text-muted hover:text-foreground transition-colors mb-8 -mx-2 px-2 py-2 rounded-md hover:bg-black/[0.03] min-h-[44px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back home
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-10 text-center"
          >
            <div className="mb-5 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-brand">
                <ShieldCheck className="w-5 h-5 text-on-brand" />
              </div>
              <div className="text-center">
                <p className="text-eyebrow">Security · Compliance · Honesty</p>
                <h1 className="marketing-hero-title text-2xl sm:text-3xl">
                  {isTrustHub
                    ? "Trust Center — how Wireline earns live calls."
                    : "How we keep your calls — and your data — safe."}
                </h1>
              </div>
            </div>
            <p className="marketing-hero-lead mx-auto max-w-prose">
              Wireline runs every call on infrastructure designed for the moments that matter: a
              customer trusting you, a regulator auditing you, a hacker testing you. This page is
              the honest summary of what we ship today, where we still have work to do, and how to
              reach us if you find something we missed.
            </p>
            <p className="mt-4 inline-flex flex-wrap justify-center gap-x-3 gap-y-1 text-eyebrow !text-[0.625rem]">
              <span className="whitespace-nowrap">Last updated · July 7, 2026</span>
              <span className="whitespace-nowrap">Reviewed for launch · July 19, 2026</span>
            </p>
          </motion.div>

          <section className="mb-10 grid gap-3 sm:grid-cols-2" aria-label="Security summary">
            {SECURITY_SUMMARY.map(([label, detail]) => (
              <div
                key={label}
                className="rounded-md border border-border bg-background/45 p-4 text-center"
              >
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </section>

          <div className="space-y-7">
            {(isTrustHub ? [...TRUST_PACK_SECTIONS, ...SECTIONS] : SECTIONS).map(
              ({ icon: Icon, title, items }, idx) => (
                <motion.section
                  key={title}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.4, delay: Math.min(idx * 0.04, 0.4) }}
                >
                  <div className="mb-3 flex items-center justify-center gap-2.5 text-center">
                    <Icon className="w-4 h-4 text-brand" strokeWidth={1.8} />
                    <h2 className="font-display italic text-lg text-foreground leading-tight">
                      {title}
                    </h2>
                  </div>
                  <ul className="mx-auto max-w-2xl space-y-1.5 text-left marketing-body">
                    {items.map((line, i) => (
                      <li key={i} className="pl-5 relative">
                        <span
                          aria-hidden="true"
                          className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full bg-brand/55"
                        />
                        {line}
                      </li>
                    ))}
                  </ul>
                </motion.section>
              ),
            )}
          </div>

          <div className="mt-12 border-t border-border pt-6 text-center">
            <p className="text-eyebrow mb-2">On the roadmap</p>
            <ul className="mx-auto max-w-2xl space-y-1 pl-5 text-left marketing-body">
              <li>SOC 2 Type II certification — audit firm engaged, target 2026 Q4.</li>
              <li>
                Continuous RLS regression checks and GraphQL exposure cleanup for all tenant tables.
              </li>
              <li>EU data residency (Frankfurt / Dublin) — target 2026 Q4.</li>
              <li>Hardware-key 2FA for Account Holder logins — target 2026 Q3.</li>
              <li>
                Paid bug bounty program — private invite launch target 2026 Q3, public program 2026
                Q4.
              </li>
            </ul>
          </div>

          <div className="mt-10 border-t border-border pt-6 text-center">
            <p className="text-eyebrow mb-3">Vertical trust packs</p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 marketing-body">
              <Link to="/trust/medical" className="text-brand hover:underline">
                Healthcare
              </Link>
              <Link to="/trust/legal" className="text-brand hover:underline">
                Legal
              </Link>
              <Link to="/trust/insurance" className="text-brand hover:underline">
                Insurance
              </Link>
              <Link to="/trust/enterprise" className="text-brand hover:underline">
                Enterprise
              </Link>
            </div>
          </div>

          <div className="mt-10 text-caption text-center space-y-2">
            <p>
              Questions?{" "}
              <a href="mailto:security@trywireline.com" className="text-brand hover:underline">
                security@trywireline.com
              </a>
            </p>
            <p>
              <Link to="/trust" className="text-brand hover:underline">
                Trust Center (sales-ready overview)
              </Link>
              {" · "}
              <Link to="/status" className="text-brand hover:underline">
                Live system status
              </Link>
            </p>
          </div>
        </div>
      </MarketingChrome>
    </>
  );
}
