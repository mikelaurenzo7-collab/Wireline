/** Public catalog selections are distinct from consented, tenant-owned clones. */
export const PHONE_CATALOG_VOICE_KEY = "botboundPhoneCatalogVoice";
export type CatalogVoiceProvider = "cartesia" | "elevenlabs";
export type CatalogPhoneVoice = {
  id: string;
  provider: CatalogVoiceProvider;
  name: string;
  language: string;
  gender: "female" | "male" | null;
};

export function catalogVoiceSelection(
  variables: unknown,
): Pick<CatalogPhoneVoice, "id" | "provider"> | null {
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) return null;
  const value = (variables as Record<string, unknown>)[PHONE_CATALOG_VOICE_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { id, provider } = value as Record<string, unknown>;
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{10,80}$/.test(id)) return null;
  return provider === "cartesia" || provider === "elevenlabs" ? { id, provider } : null;
}
