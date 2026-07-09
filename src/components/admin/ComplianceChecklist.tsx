import { useEffect, useState } from "react";
import { ShieldCheck, Download, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { authFetch } from "../../lib/api";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { cn } from "../../lib/utils";

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  href?: string;
};

const BASE_ITEMS: ChecklistItem[] = [
  { id: "rls", label: "Row-level security on tenant tables", done: true },
  {
    id: "audit",
    label: "Security audit log enabled",
    done: true,
    href: "/admin?tab=activity",
  },
  {
    id: "dnc",
    label: "DNC list configured",
    done: false,
    href: "/settings/compliance",
  },
  {
    id: "retention",
    label: "Data retention policy reviewed",
    done: false,
    href: "/admin?tab=carrier",
  },
  {
    id: "team",
    label: "Team roles assigned (least privilege)",
    done: false,
    href: "/admin?tab=team",
  },
  {
    id: "integrations",
    label: "OAuth integrations re-authorized",
    done: false,
    href: "/connections",
  },
];

export default function ComplianceChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>(BASE_ITEMS);
  const [dncCount, setDncCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dncRes, intRes] = await Promise.all([
          authFetch("/api/dnc").then((r) => (r.ok ? r.json() : null)),
          authFetch("/api/oauth/integration-health").then((r) => (r.ok ? r.json() : null)),
        ]);
        if (cancelled) return;
        const dncLen = Array.isArray(dncRes?.entries) ? dncRes.entries.length : 0;
        setDncCount(dncLen);
        const intOk =
          !intRes?.reconnect_google_calendar &&
          !intRes?.reconnect_microsoft_calendar &&
          !(Array.isArray(intRes?.reasons) && intRes.reasons.length > 0);
        setItems((prev) =>
          prev.map((item) => {
            if (item.id === "dnc") return { ...item, done: dncLen > 0 };
            if (item.id === "integrations") return { ...item, done: intOk };
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

  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="wl-panel border border-border rounded-md p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="app-section-title flex items-center gap-2 mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-brand" />
            Compliance checklist
          </p>
          <p className="text-[var(--wireline-typography-caption-size)] text-muted leading-relaxed max-w-xl">
            Account Holder-facing controls for regulated buyers. {doneCount}/{items.length} complete
            {dncCount != null ? ` · ${dncCount} DNC entries` : ""}.
          </p>
        </div>
        <ShadButton
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => {
            window.open("/api/admin/trust-pack/soc2", "_blank", "noopener,noreferrer");
          }}
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          SOC 2 index
        </ShadButton>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-[var(--wireline-typography-caption-size)]",
              item.done ? "border-brand/20 bg-brand/5" : "border-border bg-surface/40",
            )}
          >
            <span className={item.done ? "text-foreground" : "text-muted"}>{item.label}</span>
            {item.href ? (
              <Link
                to={item.href}
                className="wl-label text-brand inline-flex items-center gap-1 hover:underline shrink-0"
              >
                Review
                <ExternalLink className="w-3 h-3" />
              </Link>
            ) : (
              <span className="wl-micro-meta text-muted">{item.done ? "Done" : "Pending"}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[var(--wireline-typography-overline-size)] text-muted">
        Vertical trust packs:{" "}
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
