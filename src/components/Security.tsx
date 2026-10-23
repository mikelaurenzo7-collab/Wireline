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
      "Passwords are hashed with Node.js scrypt and a random salt for each user. They are never stored in plaintext.",
      "Password reset and email verification tokens are stored as SHA-256 hashes; plaintext exists only inside the email link.",
      "Session JWTs are signed HS256 with a secret held on the server and delivered in an httpOnly SameSite=Lax cookie (2h TTL). Mutating API calls check Origin; form posts from other sites cannot ride the session.",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Strict Browser Security Headers",
    technical: true,
    items: [
      "Content-Security-Policy: explicit allowlist; no unsafe-eval. Blocks classic XSS at the browser layer.",
      "Cross-Origin-Opener-Policy: same-origin-allow-popups. Restricts opener relationships while preserving OAuth connections initiated by the user.",
      "Cross-Origin-Resource-Policy: same-origin where appropriate. Defends against leaks in the Spectre family.",
      "Referrer-Policy: strict-origin-when-cross-origin. Permissions-Policy: locked to what we use.",
    ],
  },
  {
    icon: KeyRound,
    title: "Webhook Signature Verification",
    technical: true,
    items: [
      "Inbound webhook paths use the provider's signatures or shared secret verification with constant time comparison.",
      "Invalid signatures are rejected; timestamped HMAC paths enforce a replay window of five minutes.",
      "Outbound webhooks are signed before delivery. Shared secrets are not placed in URLs.",
    ],
  },
  {
    icon: Eye,
    title: "What We Store, and What We Don't",
    items: [
      "Call transcripts are stored in the managed database with configurable retention per account (365 days by default; supported range 90 to 365 days).",
      "Provider audio recording of full calls is disabled by default. Voicemail or message recording may create audio when intentionally used.",
      "Credit card numbers are never stored, logged, or read by BotBound servers. PCI scope is reduced through Stripe Checkout.",
      "Healthcare runtime controls can reduce sensitive content in logs and restrict some exports. Do not process PHI unless BotBound confirms a signed BAA and approved configuration in writing.",
    ],
  },
  {
    icon: HeartPulse,
    title: "Healthcare Data Controls",
    items: [
      "The compliance_mode = 'hipaa' setting for each Bot tightens runtime behavior and data handling defaults. This setting is not a certification or compliance determination.",
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
      "The right to erasure uses a server controlled deletion workflow for your product data.",
      "Contact security@botbound.app for current privacy documentation and any contractual review.",
      "Processing locations vary by provider and feature. Confirm any specific data residency requirement with BotBound in writing before sharing data.",
    ],
  },
  {
    icon: ServerCog,
    title: "Operational Security",
    technical: true,
    items: [
      "Sensitive authentication and public API paths use rate limiting; signed webhook paths fail closed when verification is unavailable.",
      "Database migrations are versioned, reviewed, and applied through the deployment pipeline.",
      "BotBound monitors calling, messaging, and reasoning health behind the scenes; issues that affect customers surface through product messaging and support.",
      "Runtime usage and reliability events record provider, model, token, cost, and latency data where the provider returns it.",
    ],
  },
  {
    icon: Database,
    title: "Database Posture",
    technical: true,
    items: [
      "Postgres on Supabase. Tenant isolation uses SET LOCAL ROLE wireline_server with app.current_user_id RLS policies for each request on tenant tables.",
      "Foreign key constraints and server controlled deletion paths remove your downstream data.",
      "Backup and point in time recovery availability follow the active Supabase plan; recovery drills remain an operational responsibility.",
    ],
  },
  {
    icon: BugPlay,
    title: "Responsible Disclosure",
    technical: true,
    items: [
      "Found a vulnerability? Email security@botbound.app with details.",
      "BotBound does not currently run a paid bug bounty. Credit or compensation is never promised before written terms.",
      "Please do not test exploits against tenant data; use only an account and data you control.",
    ],
  },
];

const TRUST_PACK_SECTIONS: SecurityTopic[] = [
  {
    icon: ShieldCheck,
    title: "Tenant Isolation",
    items: [
      "Authenticated product reads and writes are scoped through account context controlled by the server rather than filters supplied by the client alone.",
      "Provider credentials, OAuth tokens, and billing authority never ship to browsers or mobile clients.",
      "Access to another account is rejected by route ownership checks and database isolation controls.",
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
      "When available, native clients use temporary Bearer sessions against the same API; prompts, billing, and compliance stay on the server.",
      "App Store / Play account deletion paths ship with each store build. They are not a launch gate for the web product.",
    ],
  },
  {
    icon: HeartPulse,
    title: "Call Permissions and Disclosures",
    items: [
      "Your configured disclosures and recording choices apply to calls. Enable recording only with the permissions your use requires.",
      "Recipient permission and account Do Not Call checks remain enforced before eligible outgoing calls are placed.",
    ],
  },
  {
    icon: CreditCard,
    title: "Billing & Spend Controls",
    items: [
      "Runtime Balance is a prepaid ledger. Paid plans draw overflow voice from funded balance after included minutes. Existing services retain their billing and verification requirements. Live voice requires an active eligible paid plan.",
      "Paid plans include a managed AI allowance for AI, research, and enrichment funded by the platform. Calls can use up to 10 minutes of paid completion credit within their session limit. Any amount due pauses new calls and prepaid extras until topped up.",
      "Daily spend totals and cost alerts help the platform owner catch margin leaks early.",
    ],
  },
  {
    icon: Eye,
    title: "Account Deletion & Data Rights",
    items: [
      "Account deletion runs a server controlled workflow over your product data.",
      "GDPR/CCPA erasure requests follow the same workflow. Contact security@botbound.app for current privacy and security documentation.",
      "Transcript retention defaults to 365 days and supports 90 to 365 days per account. Provider audio recording of full calls defaults off; intentionally used voicemail or message recording may still create audio.",
    ],
  },
  {
    icon: Database,
    title: "Subprocessors & Vendors",
    items: [
      "Production voice: Twilio provides phone numbers, PSTN transport, SIP, and SMS. BotBound runs phone conversations, speech recognition, and transcription on contracted AI model providers, with a backup provider for continuity. A current subprocessor list is available on request.",
      "Payments: Stripe (PCI scope reduced, BotBound never stores card numbers).",
      "Data plane: Supabase Postgres. Rate limits: Upstash Redis. Hosting: Render.",
      "Email: AgentMail for Bot mailboxes managed by the platform and Bot email; Resend for transactional platform email.",
      "Computer: Browserless hosts remote browser sessions. An AI model provider processes screen context to carry out tasks.",
      "Monitoring: Sentry receives redacted server error reports and operational diagnostics when configured.",
      "Provider credentials and routing stay on the server. BotBound owns the customer experience while this Trust Center names key subprocessors for transparency.",
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
              <span className="whitespace-nowrap">Last updated · October 20, 2026</span>
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
              <li>Hardware backed MFA and enterprise identity controls.</li>
              <li>A structured vulnerability disclosure or bounty program with written scope.</li>
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
                Trust Center
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
