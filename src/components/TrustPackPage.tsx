/**
 * Vertical trust packs — review-ready evidence and boundaries for regulated buyers.
 */
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, FileCheck2, ShieldAlert, ShieldCheck } from "lucide-react";
import MarketingChrome from "./marketing/MarketingChrome";
import { PageMeta } from "../lib/page-meta";

type TrustPack = {
  eyebrow: string;
  title: string;
  subtitle: string;
  controls: Array<{ title: string; detail: string }>;
  boundary: string;
  reviewItems: string[];
};

const PACKS: Record<string, TrustPack> = {
  medical: {
    eyebrow: "Healthcare-sensitive workflows",
    title: "Controls before credentials.",
    subtitle:
      "A practical review of the safeguards available today, with explicit boundaries for protected health information.",
    controls: [
      {
        title: "Tenant-scoped data access",
        detail:
          "Server-owned tenant context and row-level policies isolate account data on authenticated database paths.",
      },
      {
        title: "Recording off by default",
        detail:
          "Audio capture requires an explicit tenant choice; transcript and recording retention are configurable.",
      },
      {
        title: "Consent and do-not-call checks",
        detail:
          "Outbound voice paths apply consent and tenant do-not-call controls before expensive provider actions.",
      },
      {
        title: "Auditable operations",
        detail:
          "Security-relevant activity, communication outcomes, and usage events are recorded where the runtime produces them.",
      },
      {
        title: "Deletion workflow",
        detail:
          "Self-serve deletion queues user-owned product data for purge and stops future subscription renewal when Stripe confirms it.",
      },
    ],
    boundary:
      "Wireline does not claim HIPAA compliance or certification. Do not send, store, or process PHI unless Wireline has confirmed both a signed BAA and an approved configuration in writing.",
    reviewItems: [
      "Confirm the exact data your workflow will handle.",
      "Approve disclosure, consent, and recording language.",
      "Choose retention and deletion requirements.",
      "Document escalation paths to licensed staff.",
    ],
  },
  legal: {
    eyebrow: "Legal & professional services",
    title: "Confidentiality-aware, never presumptive.",
    subtitle:
      "Controls for structured intake and client communication without pretending software can determine privilege, conflicts, or legal advice.",
    controls: [
      {
        title: "Tenant-scoped access",
        detail:
          "Authenticated reads and writes are constrained by server-owned account context and database isolation policies.",
      },
      {
        title: "Approved communication scripts",
        detail:
          "Teams define the disclosures, questions, escalation rules, and action boundaries their agents may use.",
      },
      {
        title: "Human approval paths",
        detail:
          "Sensitive next steps can route to staff review rather than being executed autonomously.",
      },
      {
        title: "Recording off by default",
        detail:
          "Audio capture is opt-in and should be enabled only after the firm approves jurisdiction-specific disclosures.",
      },
      {
        title: "Retention, export, and deletion",
        detail:
          "Tenant settings and server-owned workflows support operational data review and lifecycle management.",
      },
    ],
    boundary:
      "Wireline is not a law firm and does not provide legal advice. It cannot determine conflicts, privilege, representation, or matter acceptance; the firm owns those decisions and all jurisdiction-specific obligations.",
    reviewItems: [
      "Define what the agent may and may not say.",
      "Route conflict and matter-acceptance decisions to staff.",
      "Approve recording and consent rules by jurisdiction.",
      "Set retention, export, and deletion expectations.",
    ],
  },
  insurance: {
    eyebrow: "Insurance agencies",
    title: "Logged work, licensed decisions.",
    subtitle:
      "Operational controls for policyholder communication while keeping regulated advice and carrier-specific decisions with qualified people.",
    controls: [
      {
        title: "Communication audit trail",
        detail:
          "Call outcomes, transcripts, and workflow events are retained according to the tenant's configured policy.",
      },
      {
        title: "Consent and do-not-call controls",
        detail:
          "Outbound voice paths check consent posture and tenant suppression lists before dialing.",
      },
      {
        title: "Licensed human handoff",
        detail:
          "Workflows can route quotes, coverage questions, bind requests, and exceptions to qualified staff.",
      },
      {
        title: "Recording policy controls",
        detail:
          "Recording defaults off and should be enabled only with approved disclosures and jurisdictional review.",
      },
      {
        title: "Connected-system logging",
        detail:
          "When a supported CRM path is configured, approved outcomes can be written back from server-owned integration routes.",
      },
    ],
    boundary:
      "Insurance, telemarketing, disclosure, and recording rules vary by state, carrier, line of business, and use case. The agency remains responsible for licensing, approvals, and configuration.",
    reviewItems: [
      "Map licensed and unlicensed activities.",
      "Approve scripts, disclosures, and suppression rules.",
      "Define carrier and CRM write-back authority.",
      "Set supervisor and exception-routing ownership.",
    ],
  },
  enterprise: {
    eyebrow: "Enterprise review",
    title: "Proof that matches the product.",
    subtitle:
      "A concise starting point for security, procurement, and operations teams evaluating Wireline today.",
    controls: [
      {
        title: "Tenant isolation",
        detail:
          "Server-owned account context and row-level database policies constrain authenticated product access.",
      },
      {
        title: "Team access boundaries",
        detail:
          "Account roles, route ownership checks, and server-held provider credentials keep authority out of the browser.",
      },
      {
        title: "Provider spend protection",
        detail:
          "Plan-funded provider spend is protected by an always-on hard cap that customers may lower but cannot exceed.",
      },
      {
        title: "Data lifecycle controls",
        detail:
          "Configurable retention, export paths, opt-in recordings, and a server-owned deletion workflow support review.",
      },
      {
        title: "Security review channel",
        detail:
          "Buyers can send scoped architecture, privacy, and operational questions to security@trywireline.com.",
      },
    ],
    boundary:
      "SSO, residency, DPA, BAA, support, and other enterprise terms are available only when the signed order or written security response explicitly confirms them. Wireline does not currently present a SOC 2 attestation badge.",
    reviewItems: [
      "Confirm identity and access requirements.",
      "Inventory subprocessors and data regions.",
      "Agree retention, deletion, and incident contacts.",
      "Document any contractual controls before launch.",
    ],
  },
};

export default function TrustPackPage() {
  const { vertical } = useParams<{ vertical: string }>();
  const pack = vertical ? PACKS[vertical] : null;

  if (!pack) {
    return (
      <MarketingChrome>
        <PageMeta title="Trust pack not found — Wireline" noIndex />
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-muted">Trust pack not found.</p>
          <Link to="/security" className="wl-label mt-4 inline-block text-brand">
            Security overview
          </Link>
        </div>
      </MarketingChrome>
    );
  }

  return (
    <MarketingChrome stickyCta={false}>
      <PageMeta
        title={`Trust · ${pack.eyebrow}`}
        description={pack.subtitle}
        path={`/trust/${vertical}`}
      />

      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-14">
        <Link
          to="/trust"
          className="mb-8 -mx-2 inline-flex min-h-[44px] items-center gap-2 rounded-md px-2 py-2 text-caption font-medium text-muted transition-colors hover:bg-black/[0.03] hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Trust Center
        </Link>

        <section className="mx-auto max-w-3xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-brand text-on-brand">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <p className="wl-overline mt-5 text-muted-foreground">{pack.eyebrow}</p>
          <h1 className="wl-public-section-heading mx-auto mt-3 max-w-[18ch]">{pack.title}</h1>
          <p className="wl-public-copy mx-auto mt-4 max-w-2xl">{pack.subtitle}</p>
          <p className="mt-4 text-eyebrow !text-[0.625rem]">Reviewed for launch · July 28, 2026</p>
        </section>

        <section className="mt-12" aria-labelledby="shipping-now">
          <div className="text-center">
            <p className="wl-overline text-brand">Available today</p>
            <h2 id="shipping-now" className="font-display mt-2 text-2xl text-foreground">
              What ships now
            </h2>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {pack.controls.map((control) => (
              <article
                key={control.title}
                className="rounded-[1.05rem] border border-border bg-background/55 p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand/12 text-brand">
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{control.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{control.detail}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          className="mt-6 rounded-[1.05rem] border border-amber-500/25 bg-amber-500/[0.06] p-5 sm:p-6"
          aria-labelledby="boundary"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <h2 id="boundary" className="text-sm font-semibold text-foreground">
                Important boundary
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{pack.boundary}</p>
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-[1.05rem] border border-border bg-background/45 p-6 sm:p-8">
          <div className="text-center">
            <FileCheck2 className="mx-auto h-5 w-5 text-brand" aria-hidden="true" />
            <h2 className="font-display mt-3 text-2xl text-foreground">Buyer review checklist</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Resolve these items before placing the workflow into production.
            </p>
          </div>
          <ol className="mx-auto mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
            {pack.reviewItems.map((item, index) => (
              <li
                key={item}
                className="flex gap-3 rounded-lg border border-border/70 bg-background/60 p-4 text-sm leading-6 text-foreground/85"
              >
                <span className="font-mono text-brand">{String(index + 1).padStart(2, "0")}</span>
                {item}
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10 border-t border-border pt-8 text-center">
          <h2 className="font-display text-2xl text-foreground">Review the real workflow.</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Bring your use case, data map, and approval rules. Wireline will separate what is
            available today from anything that still needs contractual or technical work.
          </p>
          <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              to="/contact?intent=enterprise"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-on-brand transition-opacity hover:opacity-90"
            >
              Start a security review
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/security"
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border px-5 py-3 text-sm font-medium text-foreground transition-colors hover:bg-black/[0.03]"
            >
              Read security details
            </Link>
          </div>
        </section>
      </div>
    </MarketingChrome>
  );
}
