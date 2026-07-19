export type VapiServerEnvironment = Readonly<Record<string, string | undefined>>;

export type VapiServerAuthOverrides = {
  credentialId?: string;
  secret?: string;
};

export type VapiServerConfig = {
  url: string;
  credentialId?: string;
  /** Backward-compatible X-Vapi-Secret fallback while an account migrates to credentials. */
  secret?: string;
};

/**
 * Build Vapi's current nested server object. Custom Credentials are preferred;
 * inline secret remains a compatibility fallback supported by Vapi migration.
 */
export function buildVapiServerConfig(
  url: string,
  overrides: VapiServerAuthOverrides = {},
  env: VapiServerEnvironment = process.env,
): VapiServerConfig {
  const credentialId =
    overrides.credentialId?.trim() || env.VAPI_WEBHOOK_CREDENTIAL_ID?.trim() || "";
  if (credentialId) return { url, credentialId };

  const secret = overrides.secret?.trim() || env.VAPI_WEBHOOK_SECRET?.trim() || "";
  return secret ? { url, secret } : { url };
}
