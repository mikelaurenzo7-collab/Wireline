import React, { createContext, useContext, useState, useEffect } from "react";
import { authFetch } from "../lib/api";
import { useAuth } from "./AuthContext";

type BrandingSettings = {
  brand_name: string;
  brand_logo_url: string;
  primary_color: string;
};

const DEFAULT_BRANDING: BrandingSettings = {
  brand_name: "Wireline",
  brand_logo_url: "",
  primary_color: "#4F1E7B",
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

    const fetchBranding = async () => {
      try {
        const r = await authFetch("/api/settings");
        if (r.ok) {
          const d = await r.json();
          const s = d.settings || d;
          setBranding({
            brand_name: s.brand_name || DEFAULT_BRANDING.brand_name,
            brand_logo_url: s.brand_logo_url || DEFAULT_BRANDING.brand_logo_url,
            primary_color: s.primary_color || DEFAULT_BRANDING.primary_color,
          });
        }
      } catch (e: any) {
        // AbortError fires when the user navigates away mid-fetch — that's
        // not a real failure; only log unexpected errors.
        if (e?.name !== "AbortError" && !String(e?.message || "").includes("Failed to fetch")) {
          console.error("Failed to fetch branding", e);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchBranding();
  }, [user]);

  const updateBranding = (newSettings: Partial<BrandingSettings>) => {
    setBranding((prev) => ({ ...prev, ...newSettings }));
  };

  return (
    <BrandingContext.Provider value={{ branding, updateBranding, isLoading }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error("useBranding must be used within a BrandingProvider");
  }
  return context;
}
