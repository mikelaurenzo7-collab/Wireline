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
import { Link } from "react-router-dom";
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
      "Cross-Origin-Opener-Policy: same-origin. Prevents tab-hijacking via window.opener.",
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
      "Postgres on Supabase (US-East). Tenant isolation is enforced in application queries today; Supabase RLS policy coverage is actively being hardened.",
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
      "Please do not test exploits against tenant data; use your own trial account.",
    ],
  },
];

export default function Security() {
  return (
    <>
      <PageMeta
        title="Security & Compliance — Wireline"
        description="How Wireline handles encryption, webhook signatures, HIPAA controls, PCI scope, GDPR rights, and responsible disclosure. Honest, in detail."
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
            className="mb-10"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-md flex items-center justify-center shrink-0 bg-brand">
                <ShieldCheck className="w-5 h-5 text-on-brand" />
              </div>
              <div>
                <p className="text-eyebrow">Security · Compliance · Honesty</p>
                <h1 className="marketing-hero-title text-2xl sm:text-3xl">
                  How we keep your calls — and your data — safe.
                </h1>
              </div>
            </div>
            <p className="marketing-hero-lead max-w-prose">
              Wireline runs every call on infrastructure designed for the moments that matter: a
              customer trusting you, a regulator auditing you, a hacker testing you. This page is
              the honest summary of what we ship today, where we still have work to do, and how to
              reach us if you find something we missed.
            </p>
            <p className="mt-4 text-eyebrow !text-[0.625rem]">Last updated · May 27, 2026</p>
          </motion.div>

          <div className="space-y-7">
            {SECTIONS.map(({ icon: Icon, title, items }, idx) => (
              <motion.section
                key={title}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: Math.min(idx * 0.04, 0.4) }}
              >
                <div className="flex items-center gap-2.5 mb-2">
                  <Icon className="w-4 h-4 text-brand" strokeWidth={1.8} />
                  <h2 className="font-display italic text-lg text-foreground leading-tight">
                    {title}
                  </h2>
                </div>
                <ul className="space-y-1.5 marketing-body">
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
            ))}
          </div>

          <div className="mt-12 pt-6 border-t border-border">
            <p className="text-eyebrow mb-2">On the roadmap</p>
            <ul className="marketing-body space-y-1 list-disc pl-5">
              <li>SOC 2 Type II certification — audit firm engaged, target 2026 Q4.</li>
              <li>
                Supabase RLS policy coverage + GraphQL exposure cleanup for all tenant tables.
              </li>
              <li>EU data residency (Frankfurt / Dublin) — target 2026 Q4.</li>
              <li>Hardware-key 2FA for Account Holder logins — target 2026 Q3.</li>
              <li>
                Paid bug bounty program — private invite launch target 2026 Q3, public program 2026
                Q4.
              </li>
            </ul>
          </div>

          <div className="mt-10 pt-6 border-t border-border">
            <p className="text-eyebrow mb-3">Vertical trust packs</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 marketing-body">
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
