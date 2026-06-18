import React, { useState } from "react";
import { Switch } from "./ui/shadcn/Switch";
import { Link2, Calendar, ShieldCheck, Mail, ShoppingCart, Loader2 } from "lucide-react";
import { authFetch } from "../lib/api";
import { clientLog } from "../lib/client-log";
import { useToast } from "../contexts/ToastContext";

type Preset = {
  id: string;
  category: "Calendar" | "CRM" | "E-commerce" | "Messaging" | "Compliance";
  label: string;
  directive: string;
};

const PRESETS: Preset[] = [
  {
    id: "calendar_check",
    category: "Calendar",
    label: "Enforce calendar check",
    directive:
      "Always use check_calendar_availability before proposing any time slot. Never guess availability.",
  },
  {
    id: "zoom_link",
    category: "Calendar",
    label: "Send Zoom link",
    directive:
      "When booking a virtual meeting, always use generate_zoom_link and include the link in the confirmation.",
  },
  {
    id: "auto_log",
    category: "CRM",
    label: "Auto-log calls",
    directive:
      "After every call, use crm_log_call to record the outcome in the CRM. Never skip logging.",
  },
  {
    id: "enrich_leads",
    category: "CRM",
    label: "Enrich new leads",
    directive:
      "When a new prospect calls, use enrich_lead to pull their LinkedIn/company data before qualifying.",
  },
  {
    id: "order_lookup",
    category: "E-commerce",
    label: "Order lookup protocol",
    directive:
      "When a customer asks about an order, always use shopify_lookup_order or square_lookup_order before responding. Never guess order status.",
  },
  {
    id: "sms_confirm",
    category: "Messaging",
    label: "SMS confirmation",
    directive:
      "After booking an appointment or resolving an issue, offer to send a text confirmation using send_text_message.",
  },
  {
    id: "dnc_respect",
    category: "Compliance",
    label: "DNC respect",
    directive:
      "If a caller says 'stop calling' or 'remove my number', immediately use add_to_dnc and confirm removal.",
  },
  {
    id: "escalation_trigger",
    category: "Compliance",
    label: "Escalation trigger",
    directive:
      "If the caller explicitly asks for a human or manager, immediately use escalate_to_human. No friction.",
  },
];

const CATEGORY_ICONS = {
  Calendar: Calendar,
  CRM: Link2,
  "E-commerce": ShoppingCart,
  Messaging: Mail,
  Compliance: ShieldCheck,
};

type IntegrationDirectivePresetsProps = {
  agentId: string;
  directives: Array<{ id: string; content: string }>;
  onUpdate: () => Promise<void>;
};

export default function IntegrationDirectivePresets({
  agentId,
  directives,
  onUpdate,
}: IntegrationDirectivePresetsProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [loadingPresetId, setLoadingPresetId] = useState<string | null>(null);

  const handleToggle = async (preset: Preset, isActive: boolean) => {
    setLoadingPresetId(preset.id);
    try {
      if (isActive) {
        // Toggle OFF: delete the existing directive
        const matchingDirective = directives.find((d) => d.content === preset.directive);
        if (matchingDirective) {
          const resp = await authFetch(
            `/api/agent-config/${agentId}/directive/${matchingDirective.id}`,
            {
              method: "DELETE",
            },
          );
          if (resp.ok) {
            await onUpdate();
            toastSuccess("Preset deactivated", `${preset.label} directive removed.`);
          } else {
            throw new Error("Failed to delete preset directive");
          }
        }
      } else {
        // Toggle ON: save manual directive
        const resp = await authFetch(`/api/agent-config/${agentId}/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "directive", content: preset.directive }),
        });
        if (resp.ok) {
          await onUpdate();
          toastSuccess("Preset activated", `${preset.label} directive added.`);
        } else {
          throw new Error("Failed to add preset directive");
        }
      }
    } catch (err) {
      clientLog.error("integration-directive-presets:update", err);
      toastError("Action failed", "Could not update the integration directive. Please try again.");
    } finally {
      setLoadingPresetId(null);
    }
  };

  // Group presets by category
  const categories = Array.from(new Set(PRESETS.map((p) => p.category)));

  return (
    <section className="rounded-md wl-panel-elevated border border-border p-4 space-y-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md wl-panel border border-brand/30 text-brand flex items-center justify-center shrink-0">
          <Link2 className="w-4 h-4" />
        </div>
        <div>
          <h3 className="font-display italic text-xl text-foreground">
            Integration directive presets
          </h3>
          <p className="wl-label text-foreground/40">
            One-click rules for calendar, CRM, and compliance tools
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((cat) => {
          const Icon = CATEGORY_ICONS[cat];
          const catPresets = PRESETS.filter((p) => p.category === cat);

          return (
            <div key={cat} className="rounded-md bg-black/10 border border-border p-3 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <Icon className="w-3.5 h-3.5 text-brand" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                  {cat}
                </span>
              </div>

              <div className="space-y-3">
                {catPresets.map((preset) => {
                  const matchingDirective = directives.find((d) => d.content === preset.directive);
                  const isActive = !!matchingDirective;
                  const isLoading = loadingPresetId === preset.id;

                  return (
                    <div
                      key={preset.id}
                      className="flex items-start justify-between gap-3 p-2 rounded hover:bg-black/10 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <span className="text-xs font-medium text-foreground/90">
                          {preset.label}
                        </span>
                        <p className="text-[10px] text-muted font-mono leading-relaxed truncate hover:text-clip hover:whitespace-normal">
                          {preset.directive}
                        </p>
                      </div>
                      <div className="flex items-center shrink-0">
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-brand mr-2" />
                        ) : (
                          <Switch
                            checked={isActive}
                            onCheckedChange={() => handleToggle(preset, isActive)}
                            aria-label={`Toggle preset: ${preset.label}`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
