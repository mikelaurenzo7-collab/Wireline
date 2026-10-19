/**
 * Security.tsx — public-facing security & compliance page at /security.
 *
 * Discoverable from the TrustSignals strip + the homepage footer.
 * Documents — honestly — what BotBound ships in production today and
 * what remains on the security-attestation roadmap.
 *
 * Hard rule: no fabrication. Do not imply an attestation, certification,
 * contractual safeguard, or delivery date until it is verified and signed.
 */
import { motion } from "motion/react";
import { Link, useLocation } from "react-router";
import {
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
  type LucideIcon,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingChrome from "./marketing/MarketingChrome";

type SecurityTopic = {
  icon: LucideIcon;
  title: string;
  items: string[];
  technical?: boolean;
};

const SECTIONS: SecurityTopic[] = [
  {
    icon: Lock,
    title: "Encryption Everywhere",
    technical: true,
    items: [
      "HTTPS is enforced on public endpoints. HSTS is configured with includeSubDomains and preload.",
      "Passwords are hashed with Node.js scrypt and a random per-user salt. They are never stored in plaintext.",
      "Password-reset + email-verification tokens are stored as SHA-256 hashes; plaintext exists only inside the email link.",
      "Session JWTs are signed HS256 with a server-held secret and delivered in an httpOnly SameSite=Lax cookie (2h TTL). Mutating API calls are Origin-checked; cross-site form posts cannot ride the session.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Strict Browser Security Headers",
    technical: true,
    items: [
      "Content-Security-Policy: explicit allowlist; no unsafe-eval. Blocks classic XSS at the browser layer.",
      "Cross-Origin-Opener-Policy: same-origin-allow-popups. Restricts opener relationships while preserving user-initiated OAuth connections.",
      "Cross-Origin-Resource-Policy: same-origin where appropriate. Defends against Spectre-class leaks.",
      "Referrer-Policy: strict-origin-when-cross-origin. Permissions-Policy: locked to what we use.",
    ],
  },
  {
    icon: KeyRound,
    title: "Webhook Signature Verification",
    technical: true,
    items: [
      "Inbound webhook paths use provider-appropriate signatures or timing-safe shared-secret verification.",
      "Invalid signatures are rejected; timestamped HMAC paths enforce a five-minute replay window.",
      "Outbound webhooks are signed before delivery. Shared secrets are not placed in URLs.",
    ],
  },
  {
    icon: Eye,
    title: "What We Store, and What We Don't",
    items: [
      "Call transcripts are stored in the managed database with configurable retention per tenant (365-day default; supported range 90 to 365 days).",
      "Managed full-call provider audio recording is disabled by default. Caller-submitted voicemail or message-recording features may create audio when intentionally used.",
      "Credit card numbers are never stored, logged, or read by BotBound servers. PCI scope is reduced through Stripe Checkout.",
      "Healthcare-sensitive runtime controls can reduce sensitive content in logs and restrict some exports. Do not process PHI unless BotBound confirms a signed BAA and approved configuration in writing.",
    ],
  },
  {
    icon: HeartPulse,
    title: "Healthcare-Sensitive Controls",
    items: [
      "Per-agent compliance_mode = 'hipaa' tightens runtime behavior and data-handling defaults. This setting is not a certification or compliance determination.",
      "Do not send, store, or process PHI unless BotBound confirms both a signed BAA and an approved configuration in writing.",
      "A SOC 2 Type II attestation is not currently available. BotBound does not display an unearned badge or imply that planning equals proof.",
    ],
  },
  {
    icon: CreditCard,
    title: "Card Data Stays with Stripe",
    items: [
      "BotBound never touches card data. Payments are processed through Stripe Checkout with PCI scope reduction.",
      "We hold tokenized customer references only.",
    ],
  },
  {
    icon: Globe2,
    title: "GDPR + CCPA",
    items: [
      "Right-to-erasure uses a server-owned deletion workflow for user-owned product data.",
      "Contact security@botbound.app for current privacy documentation and any contractual review.",
      "Processing locations vary by provider and feature. Confirm any specific data-residency requirement with BotBound in writing before sharing data.",
    ],
  },
  {
    icon: ServerCog,
    title: "Operational Security",
    technical: true,
    items: [
      "High-risk authentication and public API paths use rate limiting; signed webhook paths fail closed when verification is unavailable.",
      "Database migrations are versioned, reviewed, and applied through the deployment pipeline.",
      "BotBound monitors calling, messaging, and reasoning health behind the scenes; customer-impacting issues surface through product messaging and support.",
      "Runtime usage and reliability events record provider, model, token, cost, and latency data where the provider returns it.",
    ],
  },
  {
    icon: Database,
    title: "Database Posture",
    technical: true,
    items: [
      "Postgres on Supabase. Tenant isolation uses SET LOCAL ROLE wireline_server with per-request app.current_user_id RLS policies on tenant tables.",
      "Foreign-key and server-owned deletion paths remove user-owned downstream data.",
      "Backup and point-in-time recovery availability follow the active Supabase plan; recovery drills remain an operational responsibility.",
    ],
  },
  {
    icon: BugPlay,
    title: "Responsible Disclosure",
    technical: true,
    items: [
      "Found a vulnerability? Email security@botbound.app with details.",
      "BotBound does not currently run a paid bug bounty. Credit or compensation is never promised before written terms.",
      "Please do not test exploits against tenant data; use your own Free Builder account.",
    ],
  },
];

const TRUST_PACK_SECTIONS: SecurityTopic[] = [
  {
    icon: ShieldCheck,
    title: "Tenant Isolation",
    items: [
      "Authenticated product reads and writes are scoped through server-owned tenant context rather than client-supplied filters alone.",
      "Provider credentials, OAuth tokens, and billing authority never ship to browsers or mobile clients.",
      "Cross-tenant access is rejected by route ownership checks and database isolation controls.",
    ],
  },
  {
    icon: Globe2,
    title: "BotBound Command (Browser Extension)",
    technical: true,
    items: [
      "Early access handoff only. Install from Settings, Apps; store listings are not GA.",
      "Page context is sent only when you explicitly send it to BotBound. No background harvesting.",
      "No broad host permissions, no silent browsing collection, and no auth tokens stored in the extension.",
    ],
  },
  {
    icon: ServerCog,
    title: "Native Mobile Clients",
    technical: true,
    items: [
      "Optional companions. Android is internal beta; iPhone is planned. The web app is the GA product.",
      "When available, natives use short-lived Bearer sessions against the same API; prompts, billing, and compliance stay server-owned.",
      "App Store / Play account-deletion paths ship with each store build. They are not a launch gate for the web product.",
    ],
  },
  {
    icon: HeartPulse,
    title: "Call Compliance (TCPA / DNC)",
    items: [
      "Outbound call policy accounts for recipient consent and Do Not Call screening before a call can start.",
      "Tenant DNC lists are enforced before expensive PSTN actions.",
    ],
  },
  {
    icon: CreditCard,
    title: "Billing & Spend Controls",
    items: [
      "Runtime Balance is a prepaid ledger. Paid plans draw overflow voice and SMS from funded balance after included minutes. Free Builder cannot run live voice until a paid plan is active.",
      "Paid plans include a managed AI allowance for platform-funded AI, research, and enrichment. Calls can use up to 10 minutes of paid completion credit within their session limit. Any amount due pauses new calls and prepaid extras until topped up.",
      "Daily spend accumulators and economics-at-risk alerts help the platform owner catch margin leaks early.",
    ],
  },
  {
    icon: Eye,
    title: "Account Deletion & Data Rights",
    items: [
      "Self-serve account deletion runs a server-owned workflow over user-owned product data.",
      "GDPR/CCPA erasure requests follow the same workflow. Contact security@botbound.app for current privacy and security documentation.",
      "Transcript retention defaults to 365 days and supports 90 to 365 days per tenant. Managed full-call provider audio recording defaults off; intentionally used voicemail/message-recording features may still create audio.",
    ],
  },
  {
    icon: Database,
    title: "Subprocessors & Vendors",
    items: [
      "Production voice: Twilio provides phone numbers, PSTN transport, SIP, and SMS. xAI Grok Voice runs phone conversations, including speech recognition and transcription. OpenAI Realtime runs browser voice rehearsals and is the phone fallback; OpenAI also provides the primary structured runtime. BotBound does not operate a separate voice-cloning provider.",
      "Payments: Stripe (PCI scope reduced, BotBound never stores card numbers).",
      "Data plane: Supabase Postgres. Rate limits: Upstash Redis. Hosting: Render.",
      "Email: AgentMail for platform-managed Bot mailboxes and Bot email; Resend for transactional platform email.",
      "Computer: Browserless hosts remote browser sessions. OpenAI processes screen context to carry out tasks.",
      "Monitoring: Sentry receives redacted server error reports and operational diagnostics when configured.",
      "Provider credentials and routing stay server-side. BotBound owns the customer-facing experience while this Trust Center names key subprocessors for transparency.",
    ],
  },
];

export default function Security() {
  const location = useLocation();
  const isTrustHub = location.pathname === "/trust";
  const sections = isTrustHub ? [...SECTIONS, ...TRUST_PACK_SECTIONS] : SECTIONS;
  const overviewSections = sections.filter((section) => !section.technical);
  const technicalSections = sections.filter((section) => section.technical);
  const renderSection = ({ icon: Icon, title, items }: SecurityTopic, index: number) => (
    <motion.section
      key={title}
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.4) }}
    >
      <div className="mb-4 flex flex-col items-center gap-2.5 text-center">
        <Icon className="h-4 w-4 text-brand" strokeWidth={1.8} />
        <h2 className="font-display text-lg leading-tight text-foreground">{title}</h2>
      </div>
      <ul className="mx-auto max-w-2xl space-y-1.5 text-left marketing-body">
        {items.map((line, index) => (
          <li key={index} className="pl-5 relative">
            <span
              aria-hidden="true"
              className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full bg-brand/55"
            />
            {line}
          </li>
        ))}
      </ul>
    </motion.section>
  );

  return (
    <>
      <PageMeta
        title={isTrustHub ? "Trust Center | BotBound" : "Security and Compliance | BotBound"}
        description="How BotBound handles encryption, tenant isolation, browser privacy, call compliance, billing safety, and honest security proof."
        // /trust adds buyer-facing vendor, compliance, billing, and lifecycle
        // evidence beyond /security, so each indexable route owns its canonical.
        path={isTrustHub ? "/trust" : "/security"}
      />
      <MarketingChrome stickyCta className="wl-security-page">
        <div className="wl-security-doc relative z-10 mx-auto max-w-3xl px-5 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-10 text-center"
          >
            <div className="mb-5 flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand">
                <ShieldCheck className="h-5 w-5 text-on-brand" />
              </div>
              <div className="text-center">
                <h1 className="wl-public-section-heading max-w-[22ch]">
                  {isTrustHub ? "How BotBound Earns Live Calls" : "How We Keep Your Data Safe"}
                </h1>
              </div>
            </div>
            <p className="mt-4 text-eyebrow !text-[0.625rem]">
              <span className="whitespace-nowrap">Last updated · October 19, 2026</span>
            </p>
          </motion.div>

          <section className="mb-10" aria-labelledby="trust-packs-heading">
            <h2 id="trust-packs-heading" className="mb-3 text-center text-sm font-semibold">
              Trust Packs
            </h2>
            <nav
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              aria-label="Industry trust packs"
            >
              {[
                ["medical", "Healthcare"],
                ["legal", "Legal"],
                ["insurance", "Insurance"],
                ["enterprise", "Enterprise"],
              ].map(([path, label]) => (
                <Link
                  key={path}
                  to={`/trust/${path}`}
                  className="wl-focus-ring-halo inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </section>

          <div className="space-y-7">{overviewSections.map(renderSection)}</div>

          <details className="group mt-10 border-y border-border py-2">
            <summary className="wl-focus-ring-halo flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 text-base font-semibold marker:hidden">
              <span>Technical Details</span>
              <span
                aria-hidden="true"
                className="text-xl text-muted-foreground group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="space-y-7 py-6">{technicalSections.map(renderSection)}</div>
          </details>

          <div className="mt-12 border-t border-border pt-6 text-center">
            <p className="text-eyebrow mb-2">Under active evaluation</p>
            <ul className="mx-auto max-w-2xl space-y-1 pl-5 text-left marketing-body">
              <li>Independent SOC 2 readiness work and audit planning.</li>
              <li>Continuous regression coverage for tenant isolation and public data exposure.</li>
              <li>
                Additional data regions based on contractual demand and operational readiness.
              </li>
              <li>Hardware-backed MFA and enterprise identity controls.</li>
              <li>A structured vulnerability-disclosure or bounty program with written scope.</li>
            </ul>
            <p className="mx-auto mt-3 max-w-2xl text-xs leading-5 text-muted-foreground">
              Evaluation is not a delivery commitment. Contractual requirements apply only when
              BotBound confirms them in writing.
            </p>
          </div>

          <div className="mt-10 text-caption text-center space-y-2">
            <p>
              Questions?{" "}
              <a href="mailto:security@botbound.app" className="text-brand hover:underline">
                security@botbound.app
              </a>
            </p>
            <p>
              <Link to="/trust" className="text-brand hover:underline">
                Trust Center (sales-ready overview)
              </Link>
              {" · "}
              <Link to="/support" className="text-brand hover:underline">
                BotBound support
              </Link>
            </p>
          </div>
        </div>
      </MarketingChrome>
    </>
  );
}
