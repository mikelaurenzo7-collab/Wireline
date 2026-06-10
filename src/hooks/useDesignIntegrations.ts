/**
 * useDesignIntegrations — shared Figma / Canva / GitHub export-lane state.
 *
 * Loads tenant OAuth connection status, opens the OAuth popup, and listens for
 * the DESIGN_OAUTH_SUCCESS postMessage from the callback page so every surface
 * (Painter header rail, preview export tab) stays in sync.
 */
import { useCallback, useEffect, useState } from "react";
import { authFetch, readApiJson } from "../lib/api";

export type DesignIntegrationProvider = "figma" | "canva" | "github";

export interface DesignIntegrationStatus {
  provider: DesignIntegrationProvider;
  connected: boolean;
  connectedAccount?: string;
}

export const DESIGN_OAUTH_URL_BY_PROVIDER: Record<DesignIntegrationProvider, string> = {
  figma: "/api/oauth/figma/url",
  canva: "/api/oauth/canva/url",
  github: "/api/oauth/github/url",
};

export const DESIGN_PROVIDER_LABELS: Record<DesignIntegrationProvider, string> = {
  figma: "Figma",
  canva: "Canva",
  github: "GitHub",
};

export interface UseDesignIntegrationsOptions {
  /** Fired after a successful OAuth round-trip (post-refresh). */
  onConnected?: (provider: DesignIntegrationProvider) => void;
  /** Fired when starting OAuth fails (network, missing config). */
  onConnectError?: (provider: DesignIntegrationProvider, message: string) => void;
  /** Fired when the browser blocks the OAuth popup. */
  onPopupBlocked?: () => void;
}

export interface UseDesignIntegrationsResult {
  integrations: DesignIntegrationStatus[];
  /** Provider currently mid-OAuth-start, if any. */
  connectBusy: DesignIntegrationProvider | null;
  refreshIntegrations: () => Promise<void>;
  connectIntegration: (provider: DesignIntegrationProvider) => Promise<void>;
  isConnected: (provider: DesignIntegrationProvider) => boolean;
}

export function useDesignIntegrations(
  options?: UseDesignIntegrationsOptions,
): UseDesignIntegrationsResult {
  const { onConnected, onConnectError, onPopupBlocked } = options ?? {};
  const [integrations, setIntegrations] = useState<DesignIntegrationStatus[]>([]);
  const [connectBusy, setConnectBusy] = useState<DesignIntegrationProvider | null>(null);

  const refreshIntegrations = useCallback(async () => {
    try {
      const r = await authFetch("/api/design/integrations");
      const out = await readApiJson<{ integrations?: DesignIntegrationStatus[] }>(r);
      if (out.ok === false) return;
      setIntegrations(out.data.integrations ?? []);
    } catch {
      // Non-blocking — export downloads still work without integrations.
    }
  }, []);

  useEffect(() => {
    void refreshIntegrations();
  }, [refreshIntegrations]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "DESIGN_OAUTH_SUCCESS") return;
      const provider = event.data.provider as DesignIntegrationProvider | undefined;
      void refreshIntegrations();
      if (provider) onConnected?.(provider);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [refreshIntegrations, onConnected]);

  const connectIntegration = useCallback(
    async (provider: DesignIntegrationProvider) => {
      setConnectBusy(provider);
      try {
        const r = await authFetch(DESIGN_OAUTH_URL_BY_PROVIDER[provider]);
        const out = await readApiJson<{ url?: string; error?: string }>(r);
        if (out.ok === false) throw new Error(out.error);
        if (out.data.error) throw new Error(out.data.error);
        const url = out.data.url;
        if (!url) throw new Error("OAuth URL missing");

        const width = Math.min(600, window.innerWidth * 0.9);
        const height = Math.min(700, window.innerHeight * 0.8);
        const left = (window.innerWidth - width) / 2;
        const top = (window.innerHeight - height) / 2;
        const win = window.open(
          url,
          "design_oauth_popup",
          `width=${width},height=${height},left=${left},top=${top}`,
        );
        if (!win) onPopupBlocked?.();
      } catch (e) {
        onConnectError?.(
          provider,
          e instanceof Error ? e.message : `Could not start ${provider} OAuth.`,
        );
      } finally {
        setConnectBusy(null);
      }
    },
    [onConnectError, onPopupBlocked],
  );

  const isConnected = useCallback(
    (provider: DesignIntegrationProvider) =>
      integrations.some((i) => i.provider === provider && i.connected),
    [integrations],
  );

  return { integrations, connectBusy, refreshIntegrations, connectIntegration, isConnected };
}
