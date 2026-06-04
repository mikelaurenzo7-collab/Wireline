/**
 * Mini product UIs rendered inside integration live-action cards —
 * each integration gets a tailored visual (Shopify order card, Slack bubble, etc.)
 */
import React from "react";
import { cn } from "../../lib/utils";
import type { IntegrationVisualKind } from "../../lib/integration-live-scripts";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("rounded bg-black/5 dark:bg-white/10 animate-pulse", className)} />;
}

export function IntegrationLiveVisual({
  kind,
  payload,
  status,
}: {
  kind: IntegrationVisualKind;
  payload: Record<string, string | number | boolean | undefined>;
  status: "pending" | "active" | "success";
}) {
  const dim = status === "pending" ? "opacity-40" : "";

  switch (kind) {
    case "shopify_store":
      return (
        <div className={cn("rounded-md border border-[#95BF47]/25 overflow-hidden", dim)}>
          <div className="bg-[#95BF47] px-3 py-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#1a3d0a] tracking-wide">shopify</span>
            <span className="text-[8px] uppercase text-[#1a3d0a]/70 font-semibold">Admin</span>
          </div>
          <div className="bg-[#f6f6f1] dark:bg-[#1a1f16] px-3 py-2.5 space-y-1.5">
            <p className="text-[10px] font-mono text-ink/70 truncate">
              {String(payload.store ?? "store.myshopify.com")}
            </p>
            <div className="flex gap-2">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#95BF47]/20 text-[#3d5c1a] font-medium">
                {String(payload.api ?? "GraphQL")}
              </span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/5 text-muted">
                {String(payload.scopes ?? "read_orders")}
              </span>
            </div>
          </div>
        </div>
      );

    case "shopify_order":
      return (
        <div className={cn("rounded-md border border-[#95BF47]/20 overflow-hidden", dim)}>
          <div className="bg-[#95BF47]/15 px-3 py-2 flex items-center justify-between border-b border-[#95BF47]/15">
            <span className="text-[11px] font-semibold text-ink">
              Order {String(payload.orderNumber ?? "#1042")}
            </span>
            <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-[#95BF47]/25 text-[#3d5c1a]">
              {String(payload.status ?? "Processing")}
            </span>
          </div>
          <div className="px-3 py-2 space-y-2 bg-white/80 dark:bg-black/20">
            <div className="flex items-center gap-2">
              <Skeleton className="w-8 h-8 rounded-md" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-2 w-3/4" />
                <Skeleton className="h-2 w-1/2" />
              </div>
              <span className="text-[10px] font-mono text-ink/60">
                {String(payload.total ?? "$0.00")}
              </span>
            </div>
            {payload.note && (
              <p className="text-[10px] text-muted italic border-l-2 border-[#95BF47]/40 pl-2">
                {String(payload.note)}
              </p>
            )}
            <p className="text-[9px] text-muted">
              {String(payload.items ?? 1)} item(s) · Shopify Admin
            </p>
          </div>
        </div>
      );

    case "shopify_product":
      return (
        <div
          className={cn(
            "rounded-md border border-[#95BF47]/20 p-3 bg-white/80 dark:bg-black/20",
            dim,
          )}
        >
          <div className="flex gap-3">
            <div className="w-12 h-12 rounded-md bg-[#95BF47]/15 flex items-center justify-center text-[#3d5c1a] text-lg font-bold">
              ◻
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-ink truncate">
                {String(payload.product ?? "Product")}
              </p>
              <p className="text-[9px] font-mono text-muted">SKU {String(payload.sku ?? "—")}</p>
              <div className="flex gap-2 mt-1.5">
                <span className="text-[10px] font-semibold text-[#3d5c1a]">
                  {String(payload.stock ?? 0)} in stock
                </span>
                <span className="text-[10px] text-ink/60">{String(payload.price ?? "")}</span>
              </div>
            </div>
          </div>
        </div>
      );

    case "shopify_customer":
      return (
        <div
          className={cn(
            "rounded-md border border-[#95BF47]/20 p-3 bg-white/80 dark:bg-black/20",
            dim,
          )}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#95BF47]/20 flex items-center justify-center text-[11px] font-bold text-[#3d5c1a]">
              {String(payload.name ?? "J").slice(0, 1)}
            </div>
            <div>
              <p className="text-[11px] font-semibold text-ink">
                {String(payload.name ?? "Customer")}
              </p>
              <p className="text-[9px] text-muted">{String(payload.email ?? "")}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[10px] font-semibold text-ink">
                {String(payload.orders ?? 0)} orders
              </p>
              <p className="text-[9px] text-[#3d5c1a]">LTV {String(payload.ltv ?? "")}</p>
            </div>
          </div>
        </div>
      );

    case "shopify_draft":
      return (
        <div
          className={cn(
            "rounded-md border border-dashed border-[#95BF47]/35 p-3 bg-[#95BF47]/5",
            dim,
          )}
        >
          <p className="text-[10px] uppercase tracking-wider text-[#3d5c1a] font-semibold mb-1">
            Draft order
          </p>
          <p className="text-[12px] font-mono font-semibold text-ink">
            {String(payload.draftId ?? "D-0000")}
          </p>
          <div className="flex justify-between mt-2 text-[10px]">
            <span className="text-muted">{String(payload.payment ?? "Invoice")}</span>
            <span className="font-semibold text-ink">{String(payload.total ?? "")}</span>
          </div>
        </div>
      );

    case "hubspot_contact":
      return (
        <div className={cn("rounded-md border border-[#FF7A59]/25 overflow-hidden", dim)}>
          <div className="bg-[#FF7A59] px-3 py-1">
            <span className="text-[9px] font-bold text-white uppercase tracking-wider">
              HubSpot
            </span>
          </div>
          <div className="p-3 bg-white/80 dark:bg-black/20 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#FF7A59]/20" />
              <div>
                <p className="text-[11px] font-semibold">
                  {String(payload.contact ?? payload.query ?? "Contact")}
                </p>
                <p className="text-[9px] text-muted">
                  {String(payload.outcome ?? `${payload.matches ?? 0} matches`)}
                </p>
              </div>
            </div>
            {payload.duration && (
              <p className="text-[9px] text-muted font-mono">{String(payload.duration)}</p>
            )}
          </div>
        </div>
      );

    case "hubspot_deal":
      return (
        <div
          className={cn(
            "rounded-md border border-[#FF7A59]/25 p-3 bg-white/80 dark:bg-black/20",
            dim,
          )}
        >
          <p className="text-[9px] uppercase text-[#FF7A59] font-bold mb-1">Deal pipeline</p>
          <p className="text-[11px] font-semibold text-ink">{String(payload.deal ?? "New deal")}</p>
          <div className="flex gap-2 mt-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FF7A59]/15 text-[#c44a2a] font-medium">
              {String(payload.stage ?? "Qualified")}
            </span>
            <span className="text-[10px] font-semibold text-ink ml-auto">
              {String(payload.amount ?? "")}
            </span>
          </div>
        </div>
      );

    case "slack_message":
      return (
        <div className={cn("rounded-md border border-[#4A154B]/20 p-3 bg-[#4A154B]/5", dim)}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[#4A154B] font-bold text-[10px]">#</span>
            <span className="text-[10px] font-semibold text-ink">
              {String(payload.channel ?? "#general").replace(/^#/, "")}
            </span>
          </div>
          <div className="rounded-md rounded-tl-sm bg-white dark:bg-black/30 border border-black/5 px-3 py-2 shadow-sm">
            <p className="text-[11px] text-ink/85 leading-snug">{String(payload.preview ?? "…")}</p>
          </div>
        </div>
      );

    case "teams_message":
      return (
        <div className={cn("rounded-md border border-[#6264A7]/25 p-3 bg-[#6264A7]/5", dim)}>
          <p className="text-[9px] font-bold text-[#6264A7] uppercase mb-1">Microsoft Teams</p>
          <div className="rounded-md bg-white dark:bg-black/30 border border-[#6264A7]/15 px-3 py-2">
            <p className="text-[10px] text-muted mb-0.5">{String(payload.team ?? "Team")}</p>
            <p className="text-[11px] text-ink">{String(payload.preview ?? "…")}</p>
          </div>
        </div>
      );

    case "twilio_sms":
      return (
        <div className={cn("rounded-md border border-[#F22F46]/20 p-3 bg-[#F22F46]/5", dim)}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[9px] font-bold text-[#F22F46] uppercase">Twilio SMS</span>
            <span className="text-[9px] text-muted ml-auto">
              {String(payload.status ?? "Queued")}
            </span>
          </div>
          <div className="rounded-md rounded-bl-sm bg-[#F22F46]/10 px-3 py-2 max-w-[90%]">
            <p className="text-[10px] font-mono text-ink/70">{String(payload.to ?? "+1 …")}</p>
            {payload.lineType && (
              <p className="text-[9px] text-muted mt-1">
                {String(payload.lineType)} · {String(payload.carrier ?? "")}
              </p>
            )}
          </div>
        </div>
      );

    case "calendar_slots":
      return (
        <div
          className={cn("rounded-md border border-black/10 p-3 bg-white/80 dark:bg-black/20", dim)}
        >
          <p className="text-[10px] font-semibold text-ink mb-2">
            {String(payload.date ?? "Calendar")}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {["9:00", "11:30", "2:00", "4:30"].slice(0, Number(payload.slots ?? 4)).map((t) => (
              <div
                key={t}
                className="text-[9px] text-center py-1 rounded border border-brand/20 bg-brand/5 text-brand font-medium"
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      );

    case "docusign_envelope":
      return (
        <div className={cn("rounded-md border border-[#005CB9]/25 overflow-hidden", dim)}>
          <div className="bg-[#005CB9] px-3 py-1.5">
            <span className="text-[9px] font-bold text-white uppercase">DocuSign</span>
          </div>
          <div className="p-3 bg-white/80 dark:bg-black/20">
            <p className="text-[11px] font-semibold text-ink">
              {String(payload.template ?? "Agreement")}
            </p>
            <p className="text-[9px] text-muted mt-1">
              {String(payload.signers ?? 1)} signer(s) · {String(payload.status ?? "Sent")}
            </p>
            <div className="mt-2 h-8 rounded border-2 border-dashed border-[#005CB9]/30 flex items-center justify-center">
              <span className="text-[9px] text-[#005CB9] font-medium">Sign here</span>
            </div>
          </div>
        </div>
      );

    case "square_payment":
      return (
        <div className={cn("rounded-md border border-[#006AFF]/20 p-3 bg-[#006AFF]/5", dim)}>
          <p className="text-[9px] font-bold text-[#006AFF] uppercase mb-1">Square</p>
          <p className="text-[11px] font-semibold text-ink">
            {String(payload.orderId ?? payload.amount ?? "Payment")}
          </p>
          <p className="text-[10px] text-muted">{String(payload.status ?? payload.name ?? "")}</p>
          {payload.total && (
            <p className="text-[12px] font-bold text-ink mt-1">{String(payload.total)}</p>
          )}
        </div>
      );

    case "square_catalog":
      return (
        <div className={cn("rounded-md border border-[#006AFF]/20 p-3", dim)}>
          <p className="text-[11px] font-semibold">{String(payload.item ?? "Catalog item")}</p>
          <p className="text-[10px] text-[#006AFF] font-medium mt-1">
            {String(payload.stock ?? 0)} in stock · {String(payload.price ?? "")}
          </p>
        </div>
      );

    case "apollo_profile":
      return (
        <div
          className={cn("rounded-md border border-black/10 p-3 bg-white/80 dark:bg-black/20", dim)}
        >
          <p className="text-[11px] font-semibold text-ink">
            {String(payload.company ?? payload.market ?? "Lead")}
          </p>
          <p className="text-[10px] text-muted">
            {String(payload.title ?? `${payload.leads ?? 0} leads`)}
          </p>
          {payload.employees && (
            <p className="text-[9px] text-muted mt-1">{String(payload.employees)} employees</p>
          )}
        </div>
      );

    case "sheets_row":
      return (
        <div
          className={cn(
            "rounded-md border border-[#34A853]/25 overflow-hidden font-mono text-[9px]",
            dim,
          )}
        >
          <div className="grid grid-cols-4 bg-[#34A853]/10 border-b border-[#34A853]/15">
            {["A", "B", "C", "D"].map((c) => (
              <div key={c} className="px-2 py-1 text-center text-muted font-bold">
                {c}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 bg-white/80 dark:bg-black/20">
            {[1, 2, 3, 4].map((c) => (
              <div key={c} className="px-2 py-1.5 border-r border-black/5 last:border-0">
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
          <p className="px-2 py-1 text-[8px] text-muted bg-black/[0.02]">
            Row {String(payload.row ?? "—")} ·{" "}
            {String(payload.sheet ?? payload.workbook ?? "Sheet")}
          </p>
        </div>
      );

    case "zoom_meeting":
      return (
        <div className={cn("rounded-md border border-[#2D8CFF]/25 p-3 bg-[#2D8CFF]/5", dim)}>
          <p className="text-[9px] font-bold text-[#2D8CFF] uppercase">Zoom</p>
          <p className="text-[11px] font-semibold text-ink mt-1">
            {String(payload.topic ?? "Meeting")}
          </p>
          <p className="text-[10px] text-muted">{String(payload.duration ?? "30 min")}</p>
        </div>
      );

    case "director_orchestrate":
    default:
      return (
        <div className={cn("rounded-md border border-brand/15 p-3 bg-brand/[0.04]", dim)}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
            <p className="text-[11px] font-medium text-ink">{String(payload.mode ?? "Director")}</p>
          </div>
          <p className="text-[10px] text-muted mt-1">
            {String(payload.signals ?? payload.cards ?? "Working…")}
          </p>
        </div>
      );
  }
}
