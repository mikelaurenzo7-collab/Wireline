/* eslint-disable @typescript-eslint/no-explicit-any -- shared context values bridge typed and untyped sub-systems. */
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
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
  brand_name: "Wireline",
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
  const [branding, setBranding] = useState<BrandingSettings>(DEFAULT_BRANDING);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setBranding(DEFAULT_BRANDING);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();

    const fetchBranding = async () => {
      try {
        const r = await authFetch("/api/settings", { signal: controller.signal });
        if (r.ok) {
          const d = await r.json();
          const s = d.settings || d;
          setBranding({
            brand_name: s.brand_name || DEFAULT_BRANDING.brand_name,
            brand_logo_url: s.brand_logo_url || DEFAULT_BRANDING.brand_logo_url,
            primary_color: s.primary_color || DEFAULT_BRANDING.primary_color,
            business_name: s.business_name || DEFAULT_BRANDING.business_name,
            business_type: s.business_type || DEFAULT_BRANDING.business_type,
            primary_product: s.primary_product || DEFAULT_BRANDING.primary_product,
          });
        }
      } catch (e: any) {
        if (e?.name === "AbortError" || String(e?.message || "").includes("Failed to fetch")) {
          return;
        }
        console.error("[BrandingContext] settings fetch failed:", e?.message ?? e);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBranding();
    return () => controller.abort();
  }, [user]);

  const updateBranding = useCallback((newSettings: Partial<BrandingSettings>) => {
    setBranding((prev) => ({ ...prev, ...newSettings }));
  }, []);

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
