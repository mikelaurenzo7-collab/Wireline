import { BRAND } from "../constants/brand-colors";

/** Wireline Lavender Noir theming for Clerk prebuilt auth components. */
export const wirelineClerkAppearance = {
  variables: {
    colorPrimary: BRAND.purple,
    colorText: BRAND.ink,
    colorTextSecondary: BRAND.purpleMuted,
    colorBackground: BRAND.paper,
    colorInputBackground: BRAND.paper,
    colorInputText: BRAND.ink,
    borderRadius: "0.375rem",
    fontFamily: '"Plus Jakarta Sans Variable", system-ui, sans-serif',
    fontFamilyButtons: '"Plus Jakarta Sans Variable", system-ui, sans-serif',
  },
  elements: {
    card: "shadow-[0_24px_80px_-56px_rgba(30,27,46,0.55)] border border-border",
    headerTitle: "font-display tracking-tight",
    headerSubtitle: "text-muted-foreground",
    formButtonPrimary:
      "bg-brand hover:bg-brand-deep text-paper font-semibold min-h-[48px] shadow-none",
    socialButtonsBlockButton:
      "border border-border bg-card hover:border-brand/30 min-h-[48px] font-medium",
    footerActionLink: "text-brand font-medium hover:text-brand-deep",
    identityPreviewEditButton: "text-brand",
  },
};
