import { useEffect, useState } from "react";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { Link } from "react-router";
import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import { getIntegrationChecklistStatus } from "./compliance-checklist-status";

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  applicable?: boolean;
  href?: string;
};

// Only what the business owner controls or relies on. Platform engineering
// controls (database isolation, audit logging) belong on /security, not here.
const BASE_ITEMS: ChecklistItem[] = [
  { id: "ai_disclosure", label: "Every call opens with an AI disclosure", done: true },
  { id: "opt_outs", label: "Opt-out requests are blocked automatically", done: true },
  {
    id: "dnc_registry",
    label: "Do Not Call Registry subscription added",
    done: false,
    href: "/settings/compliance",
  },
  {
    id: "integrations",
    label: "Connected apps working",
    done: false,
    href: "/connections",
  },
];

export default function ComplianceChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>(BASE_ITEMS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [registryRes, intRes] = await Promise.all([
          authFetch("/api/compliance/dnc-registration").then((r) => (r.ok ? r.json() : null)),
          authFetch("/api/oauth/integration-health").then((r) => (r.ok ? r.json() : null)),
        ]);
        if (cancelled) return;
        // The owner's part is done once the subscription is added; BotBound
        // then connects screening ("Connecting") on its side.
        const registryState = typeof registryRes?.state === "string" ? registryRes.state : null;
        // Empty or failed health responses cannot prove a connection is healthy.
        const integrationStatus = getIntegrationChecklistStatus(intRes);
        setItems((prev) =>
          prev.map((item) => {
            if (item.id === "dnc_registry") {
              return {
                ...item,
                done: registryState === "active" || registryState === "pending_link",
              };
            }
            if (item.id === "integrations") {
              return {
                ...item,
                done: integrationStatus === "done",
                applicable: integrationStatus !== "not_applicable",
              };
            }
            return item;
          }),
        );
      } catch {
        // Checklist degrades to static defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applicableItems = items.filter((item) => item.applicable !== false);
  const doneCount = applicableItems.filter((item) => item.done).length;

  return (
    <div className="wl-panel border border-border rounded-md p-4 space-y-4">
      <div>
        <p className="app-section-title flex items-center gap-2 mb-1">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-brand" />
          Compliance Checklist
        </p>
        <p className="text-[length:var(--wireline-typography-caption-size)] text-muted leading-relaxed max-w-xl">
          What keeps your calls and texts compliant. {doneCount}/{applicableItems.length} complete.
        </p>
      </div>
      <ul className="space-y-2">
        {applicableItems.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[length:var(--wireline-typography-caption-size)]",
              item.done ? "border-brand/20 bg-brand/5" : "border-border bg-surface/40",
            )}
          >
            <span className={item.done ? "text-foreground" : "text-muted"}>{item.label}</span>
            {item.href && !item.done ? (
              <Link
                to={item.href}
                className="wl-label text-brand inline-flex items-center gap-1 hover:underline shrink-0"
              >
                Set Up
                <ExternalLink className="w-3 h-3" />
              </Link>
            ) : (
              <span className="wl-micro-meta shrink-0 whitespace-nowrap text-muted">
                {item.done ? "Done" : "Pending"}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[length:var(--wireline-typography-overline-size)] text-muted">
        Industry guides:{" "}
        <Link to="/trust/medical" className="text-brand hover:underline">
          Healthcare
        </Link>
        {" · "}
        <Link to="/trust/legal" className="text-brand hover:underline">
          Legal
        </Link>
        {" · "}
        <Link to="/trust/enterprise" className="text-brand hover:underline">
          Enterprise
        </Link>
      </p>
    </div>
  );
}
