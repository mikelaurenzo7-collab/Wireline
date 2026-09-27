/* eslint-disable @typescript-eslint/no-explicit-any -- shared context values bridge typed and untyped sub-systems. */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { authFetch } from "../lib/api";
import { useAuth } from "./AuthContext";

type BrandingSettings = {
  brand_name: string;
  brand_logo_url: string;
  primary_color: string;
  business_name: string;
  business_type: string;
  primary_product: string;
};

const DEFAULT_BRANDING: BrandingSettings = {
  brand_name: "BotBound",
  brand_logo_url: "",
  primary_color: "#A78BFA",
  business_name: "",
  business_type: "",
  primary_product: "",
};

type BrandingContextType = {
  branding: BrandingSettings;
  updateBranding: (newSettings: Partial<BrandingSettings>) => void;
  isLoading: boolean;
};

const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const ownerId = user?.id ?? null;
  const scopeRef = useRef({ ownerId });
  if (scopeRef.current.ownerId !== ownerId) scopeRef.current = { ownerId };
  const scope = scopeRef.current;
  const [state, setState] = useState(() => ({
    scope,
    branding: DEFAULT_BRANDING,
    isLoading: Boolean(ownerId),
  }));
  // Auth can change without remounting this provider. Never expose the previous
  // account's settings while the new owner's effect or request is still pending.
  const branding = state.scope === scope ? state.branding : DEFAULT_BRANDING;
  const isLoading = state.scope === scope ? state.isLoading : Boolean(ownerId);

  useEffect(() => {
    if (!ownerId) {
      setState({ scope, branding: DEFAULT_BRANDING, isLoading: false });
      return;
    }

    const controller = new AbortController();
    const isCurrent = () => !controller.signal.aborted && scopeRef.current === scope;
    setState((previous) =>
      previous.scope === scope ? previous : { scope, branding: DEFAULT_BRANDING, isLoading: true },
    );

    const fetchBranding = async () => {
      try {
        const r = await authFetch("/api/settings", { signal: controller.signal });
        if (r.ok) {
          const d = await r.json();
          if (!isCurrent()) return;
          const s = d.settings || d;
          setState({
            scope,
            isLoading: false,
            branding: {
              brand_name: s.brand_name || DEFAULT_BRANDING.brand_name,
              brand_logo_url: s.brand_logo_url || DEFAULT_BRANDING.brand_logo_url,
              primary_color: s.primary_color || DEFAULT_BRANDING.primary_color,
              business_name: s.business_name || DEFAULT_BRANDING.business_name,
              business_type: s.business_type || DEFAULT_BRANDING.business_type,
              primary_product: s.primary_product || DEFAULT_BRANDING.primary_product,
            },
          });
        }
      } catch (e: any) {
        if (!isCurrent()) return;
        if (e?.name === "AbortError" || String(e?.message || "").includes("Failed to fetch")) {
          return;
        }
        console.error("[BrandingContext] settings fetch failed:", e?.message ?? e);
      } finally {
        if (isCurrent()) {
          setState((previous) =>
            previous.scope === scope ? { ...previous, isLoading: false } : previous,
          );
        }
      }
    };

    fetchBranding();
    return () => controller.abort();
  }, [ownerId, scope, user]);

  const updateBranding = useCallback(
    (newSettings: Partial<BrandingSettings>) => {
      // A save completing for a departed account must not mutate the next one.
      if (!ownerId || scopeRef.current !== scope) return;
      setState((previous) =>
        previous.scope === scope
          ? { ...previous, branding: { ...previous.branding, ...newSettings } }
          : previous,
      );
    },
    [ownerId, scope],
  );

  const value = useMemo(
    () => ({ branding, updateBranding, isLoading }),
    [branding, updateBranding, isLoading],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
}
