import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import StripeBillingCard from "../components/StripeBillingCard";

export default function BillingSettings() {
  return (
    <WorkspaceShell
      eyebrow="Administration"
      title="Billing & plan"
      contentClassName="pt-6"
      action={
        <Link to="/settings" className="workspace-btn-secondary px-4 py-2.5">
          <ArrowLeft size={16} />
          Back to settings
        </Link>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <div className="mx-auto max-w-[920px]">
          <StripeBillingCard />
        </div>
      </div>
    </WorkspaceShell>
  );
}
