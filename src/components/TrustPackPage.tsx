/**
 * Vertical trust packs — sales asset for regulated buyers.
 */
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import MarketingChrome from "./marketing/MarketingChrome";
import { PageMeta } from "../lib/page-meta";

const PACKS: Record<
  string,
  { title: string; subtitle: string; bullets: string[]; disclaimer: string }
> = {
  medical: {
    title: "Healthcare account holders",
    subtitle: "Controls implemented today — BAA and HIPAA certification on the Enterprise roadmap.",
    bullets: [
      "Row-level security on every tenant table",
      "Audit log for security-relevant events",
      "TCPA consent capture on outbound voice",
      "Configurable retention and account deletion",
      "Recording disclosure tooling in agent flows",
    ],
    disclaimer:
      "Wireline is not HIPAA-certified at this time. Do not use Wireline for PHI until a BAA is signed.",
  },
  legal: {
    title: "Legal & professional services",
    subtitle: "Confidentiality-first defaults for intake and client communications.",
    bullets: [
      "Single-tenant data isolation with RLS",
      "DNC list and consent ledger",
      "Role-based access for team members",
      "Export and deletion on request",
      "SOC 2 Type II audit targeted 2026 Q4",
    ],
    disclaimer: "Consult your compliance counsel for matter-specific obligations.",
  },
  insurance: {
    title: "Insurance agencies",
    subtitle: "Carrier-grade logging with Account Holder oversight.",
    bullets: [
      "Call transcripts and outcome classification",
      "CRM auto-log for HubSpot/Salesforce paths",
      "Supervisor Active calls and approvals",
      "Encryption in transit and at rest",
    ],
    disclaimer:
      "State insurance telemarketing rules vary — configure DNC and disclosures per jurisdiction.",
  },
  enterprise: {
    title: "Enterprise",
    subtitle: "Security posture documentation available under NDA.",
    bullets: [
      "SSO-ready team model",
      "Spend budgets and audit exports",
      "Custom retention policies",
      "Dedicated support and white-glove onboarding",
      "SOC 2 evidence pack available to qualified buyers",
    ],
    disclaimer: "Contact sales for BAA, DPA, and custom security review.",
  },
};

export default function TrustPackPage() {
  const { vertical } = useParams<{ vertical: string }>();
  const pack = vertical ? PACKS[vertical] : null;

  if (!pack) {
    return (
      <MarketingChrome>
        <PageMeta title="Trust pack not found — Wireline" noIndex />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <p className="text-muted">Trust pack not found.</p>
          <Link to="/security" className="text-brand wl-label mt-4 inline-block">
            ← Security overview
          </Link>
        </div>
      </MarketingChrome>
    );
  }

  return (
    <MarketingChrome>
      <PageMeta
        title={`Trust · ${pack.title}`}
        description={pack.subtitle}
        path={`/trust/${vertical}`}
      />
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <Link
          to="/security"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-6 touch-press"
        >
          <ArrowLeft className="w-4 h-4" />
          Security overview
        </Link>
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-brand/12 text-brand">
            <ShieldCheck className="w-5 h-5" />
          </span>
          <div className="text-center">
            <h1 className="font-display italic text-2xl text-foreground">{pack.title}</h1>
            <p className="text-sm text-muted mt-1">{pack.subtitle}</p>
          </div>
        </div>
        <ul className="mx-auto mb-8 max-w-xl space-y-3 text-left">
          {pack.bullets.map((b) => (
            <li key={b} className="flex gap-2 text-sm text-foreground/80 leading-relaxed">
              <span className="text-brand mt-0.5">✓</span>
              {b}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted border-t border-border pt-4 leading-relaxed">
          {pack.disclaimer}
        </p>
      </div>
    </MarketingChrome>
  );
}
