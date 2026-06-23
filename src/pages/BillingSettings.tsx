import { Link } from "react-router-dom";
import { ArrowLeft, CreditCard, Receipt, ShieldCheck, Banknote, Building2 } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import StripeBillingCard from "../components/StripeBillingCard";

export default function BillingSettings() {
  return (
    <WorkspaceShell
      eyebrow="Administration"
      title="Enterprise Billing & Plan"
      contentClassName="pt-6"
      action={
        <Link to="/settings" className="workspace-btn-secondary px-4 py-2.5">
          <ArrowLeft size={16} />
          Back to Settings
        </Link>
      }
    >
      <div className="min-h-0 flex-1 pb-6 space-y-6">
        {/* Enterprise Billing Posture */}
        <div className="mx-auto max-w-[1080px] grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-md wl-panel border border-brand/20 bg-brand/5">
            <div className="flex items-center gap-2 wl-label text-brand mb-2">
              <ShieldCheck className="w-3.5 h-3.5" /> Compliance
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-display text-foreground">PCI DSS</span>
              <span className="text-xs font-bold text-brand uppercase tracking-wider">Level 1</span>
            </div>
            <p className="wl-micro-meta--muted">All transactions securely vaulted via Stripe.</p>
          </div>

          <div className="p-4 rounded-md wl-panel border border-white/10 bg-white/5">
            <div className="flex items-center gap-2 wl-label text-muted mb-2">
              <Building2 className="w-3.5 h-3.5" /> Corporate Entity
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-display text-foreground">Verified</span>
            </div>
            <p className="wl-micro-meta--muted">Tax ID & business registry on file.</p>
          </div>

          <div className="p-4 rounded-md wl-panel border border-white/10 bg-white/5">
            <div className="flex items-center gap-2 wl-label text-muted mb-2">
              <Receipt className="w-3.5 h-3.5" /> Invoicing
            </div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-display text-foreground">Net-30</span>
              <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">
                Eligible
              </span>
            </div>
            <p className="wl-micro-meta--muted">Enterprise PO billing available.</p>
          </div>
        </div>

        {/* Primary Stripe Controller */}
        <div className="mx-auto max-w-[1080px]">
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-brand" /> Active Subscription
            </h2>
          </div>
          <StripeBillingCard />
        </div>

        {/* Contract & Ledger Area */}
        <div className="mx-auto max-w-[1080px]">
          <div className="p-6 rounded-md wl-panel border border-border bg-surface/50 mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Banknote className="w-4 h-4 text-brand" /> Ledger & Invoices
              </h3>
            </div>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Past invoices and detailed metered usage receipts are generated dynamically at the end
              of each billing cycle. To download PDF receipts or update your corporate tax IDs,
              launch the secure Stripe Billing Portal above.
            </p>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}
