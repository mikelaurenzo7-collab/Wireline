import { URL } from "node:url";

/**
 * Supabase's database certificate chain terminates at this official root CA.
 * Source: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
 *
 * Keeping the public CA in the server bundle makes verification deterministic
 * in Vercel functions and deploy-time tooling without a secret environment
 * variable or a mutable filesystem dependency.
 */
export const SUPABASE_ROOT_CA_2021 = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

// node-postgres warns that these URL parameters overwrite an explicit `ssl`
// object. Supabase connections are emitted as discrete credentials below, so
// URL options are never forwarded to the driver. Removing the known SSL keys
// first makes that security boundary explicit and safe to reuse.
const SSL_OVERRIDE_QUERY_KEYS = new Set([
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "sslpassword",
]);

function parseConnectionString(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:" ? parsed : null;
  } catch {
    return null;
  }
}

function isSupabaseHostname(hostname) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase();
  return host.endsWith(".supabase.co") || host.endsWith(".supabase.com");
}

function strictSupabaseSsl(hostname) {
  return {
    ca: SUPABASE_ROOT_CA_2021,
    rejectUnauthorized: true,
    servername: hostname,
  };
}

function sanitizeSupabaseUrl(parsed) {
  const sanitized = new URL(parsed.toString());
  for (const key of [...sanitized.searchParams.keys()]) {
    if (SSL_OVERRIDE_QUERY_KEYS.has(key.toLowerCase())) sanitized.searchParams.delete(key);
  }
  return sanitized;
}

function decodeUrlPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isSupabasePostgresConnectionString(connectionString) {
  const parsed = parseConnectionString(connectionString);
  return Boolean(parsed && isSupabaseHostname(parsed.hostname));
}

/**
 * Build node-postgres Client/Pool connection options. Supabase connections use
 * hostname verification and the official CA; other providers retain their
 * existing URL-defined policy unchanged.
 */
export function getPostgresConnectionConfig(connectionString) {
  const raw = String(connectionString || "").trim();
  const parsed = parseConnectionString(raw);
  if (!parsed || !isSupabaseHostname(parsed.hostname)) return { connectionString: raw };

  const sanitized = sanitizeSupabaseUrl(parsed);
  return {
    host: sanitized.hostname,
    port: Number.parseInt(sanitized.port || "5432", 10),
    user: decodeUrlPart(sanitized.username),
    password: decodeUrlPart(sanitized.password),
    database: decodeUrlPart(sanitized.pathname.replace(/^\/+/, "")),
    ssl: strictSupabaseSsl(sanitized.hostname),
  };
}

/**
 * Drizzle Kit's PostgreSQL config accepts either a URL or discrete connection
 * fields with an SSL object. Supabase uses the latter so no URL parameter can
 * silently replace strict certificate verification.
 */
export function getDrizzlePostgresCredentials(connectionString) {
  const raw = String(connectionString || "").trim();
  const parsed = parseConnectionString(raw);
  if (!parsed || !isSupabaseHostname(parsed.hostname)) return { url: raw };

  const sanitized = sanitizeSupabaseUrl(parsed);
  return {
    host: sanitized.hostname,
    port: Number.parseInt(sanitized.port || "5432", 10),
    user: decodeUrlPart(sanitized.username),
    password: decodeUrlPart(sanitized.password),
    database: decodeUrlPart(sanitized.pathname.replace(/^\/+/, "")),
    ssl: strictSupabaseSsl(sanitized.hostname),
  };
}
