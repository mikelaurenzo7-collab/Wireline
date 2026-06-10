/**
 * PainterIntegrationRail — always-visible Figma / Canva / GitHub lane chips for
 * the Painter studio header. Connected lanes show the linked account; pending
 * lanes connect via OAuth popup in one click. Status syncs with the preview
 * Export tab through the shared useDesignIntegrations hook.
 */
import React from "react";
import { Check, Figma, Github, Loader2, Palette, Plus } from "lucide-react";
import {
  useDesignIntegrations,
  DESIGN_PROVIDER_LABELS,
  type DesignIntegrationProvider,
} from "../hooks/useDesignIntegrations";
import { PAINTER_INTEGRATION_RAIL } from "../lib/wireline-painter-design";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import { ShadButton } from "./ui/shadcn/ShadButton";

const PROVIDER_ORDER: readonly DesignIntegrationProvider[] = ["figma", "canva", "github"];

function ProviderIcon({ provider }: { provider: DesignIntegrationProvider }) {
  switch (provider) {
    case "figma":
      return <Figma className="w-3 h-3" aria-hidden />;
    case "canva":
      return <Palette className="w-3 h-3" aria-hidden />;
    case "github":
      return <Github className="w-3 h-3" aria-hidden />;
  }
}

export default function PainterIntegrationRail({ className }: { className?: string }) {
  const { error: toastError, warning: toastWarning } = useToast();
  const { integrations, connectBusy, connectIntegration } = useDesignIntegrations({
    onConnectError: (provider, message) =>
      toastError(`${DESIGN_PROVIDER_LABELS[provider]} connection failed`, message),
    onPopupBlocked: () =>
      toastWarning("Popup blocked", "Allow popups for this site to connect your account."),
  });

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="group"
      aria-label={PAINTER_INTEGRATION_RAIL.ariaLabel}
    >
      <span className="wl-label text-muted hidden xl:inline mr-1">
        {PAINTER_INTEGRATION_RAIL.eyebrow}
      </span>
      {PROVIDER_ORDER.map((provider) => {
        const status = integrations.find((i) => i.provider === provider);
        const connected = Boolean(status?.connected);
        const busy = connectBusy === provider;
        const label = DESIGN_PROVIDER_LABELS[provider];
        const title = connected
          ? `${label} — ${status?.connectedAccount || PAINTER_INTEGRATION_RAIL.connectedHint}`
          : `${PAINTER_INTEGRATION_RAIL.connectPrefix} ${label}`;
        return (
          <ShadButton
            key={provider}
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            onClick={() => {
              if (!connected && !busy) void connectIntegration(provider);
            }}
            disabled={busy}
            aria-label={title}
            title={title}
            className={cn(
              "h-7 px-2 gap-1 rounded-md border text-[11px] font-semibold touch-press hover:scale-[1.05] transition-colors",
              connected
                ? "bg-brand/8 border-brand/20 text-brand hover:bg-brand/12 hover:text-brand cursor-default"
                : "bg-paper/60 border-brand/10 text-muted-foreground hover:text-brand hover:border-brand/25 dark:bg-velvet/40",
            )}
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
            ) : (
              <ProviderIcon provider={provider} />
            )}
            <span className="hidden md:inline">{label}</span>
            {connected ? (
              <Check className="w-3 h-3" aria-hidden />
            ) : (
              <Plus className="w-3 h-3 opacity-60" aria-hidden />
            )}
          </ShadButton>
        );
      })}
    </div>
  );
}
