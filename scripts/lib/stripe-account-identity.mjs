// Keep the Stripe account identity aligned with the public merchant name. The
// product remains "Wireline" inside Checkout, while the Dashboard/business
// profile uses "Try Wireline" to match the canonical trywireline.com domain.
export const STRIPE_PUBLIC_BRAND = "Try Wireline";
export const STRIPE_PUBLIC_HOSTS = new Set(["trywireline.com", "www.trywireline.com"]);
export const STRIPE_PUBLIC_SUPPORT_URL = "https://trywireline.com/support";
export const STRIPE_PUBLIC_SUPPORT_EMAIL = "support@trywireline.com";
export const STRIPE_STATEMENT_DESCRIPTOR_PREFIX = "WIRELINE";
export const STRIPE_BRAND_PRIMARY_COLOR = "#A78BFA";
export const STRIPE_BRAND_SECONDARY_COLOR = "#141319";

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedBrand(value) {
  return normalizeText(value).toLowerCase();
}

function publicUrlIdentity(value) {
  const raw = normalizeText(value);
  if (!raw) return { hostname: "", protocol: "" };
  try {
    const url = new URL(raw);
    return { hostname: url.hostname.toLowerCase(), protocol: url.protocol.toLowerCase() };
  } catch {
    return { hostname: "", protocol: "" };
  }
}

function canonicalHttpsUrl(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol.toLowerCase() !== "https:") return "";
    const pathname = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${pathname}`;
  } catch {
    return "";
  }
}

export function hasWirelineDescriptor(value) {
  const normalized = normalizeText(value).toUpperCase();
  return /^WIRELINE(?:$|[\s*-])/.test(normalized);
}

/**
 * Stripe uses the static payment descriptor as the card prefix when an
 * explicit card prefix is absent, truncating it to 10 characters. Model that
 * provider contract directly so launch certification does not reject a valid
 * account merely because the optional override is null.
 */
export function effectiveStripeCardStatementDescriptor(account) {
  const explicit = normalizeText(
    account?.settings?.card_payments?.statement_descriptor_prefix,
  );
  if (explicit) {
    return { value: explicit, source: "explicit" };
  }

  const paymentDescriptor = normalizeText(account?.settings?.payments?.statement_descriptor);
  return {
    value: paymentDescriptor.slice(0, 10),
    source: paymentDescriptor ? "payment_statement_descriptor_fallback" : "missing",
  };
}

function finding(level, message, metadata = {}) {
  return { level, message, metadata };
}

/**
 * Inspect only customer-facing Stripe account identity fields.
 *
 * Never include owner, representative, bank, address, tax, or verification data
 * in findings or summaries. This guard exists to prevent an otherwise-correct
 * Wireline catalog from shipping under a stale product name or domain.
 */
export function stripeAccountIdentityFindings(account) {
  const findings = [];
  const profileName = normalizeText(account?.business_profile?.name);
  const profileUrl = normalizeText(account?.business_profile?.url);
  const profileIdentity = publicUrlIdentity(profileUrl);
  const cardDescriptor = effectiveStripeCardStatementDescriptor(account);
  const paymentDescriptor = normalizeText(account?.settings?.payments?.statement_descriptor);

  if (normalizedBrand(profileName) !== normalizedBrand(STRIPE_PUBLIC_BRAND)) {
    findings.push(
      finding("error", "Stripe business profile name does not match the Wireline brand.", {
        expected: STRIPE_PUBLIC_BRAND,
        actual: profileName || null,
      }),
    );
  }

  if (profileIdentity.protocol !== "https:" || !STRIPE_PUBLIC_HOSTS.has(profileIdentity.hostname)) {
    findings.push(
      finding("error", "Stripe business profile URL is not the canonical Wireline domain.", {
        expected_hosts: [...STRIPE_PUBLIC_HOSTS],
        expected_protocol: "https:",
        actual_host: profileIdentity.hostname || null,
        actual_protocol: profileIdentity.protocol || null,
      }),
    );
  }

  const supportUrl = canonicalHttpsUrl(account?.business_profile?.support_url);
  if (supportUrl !== STRIPE_PUBLIC_SUPPORT_URL) {
    findings.push(
      finding("error", "Stripe support URL is not the canonical Wireline support page.", {
        expected: STRIPE_PUBLIC_SUPPORT_URL,
        actual: supportUrl || null,
      }),
    );
  }

  const supportEmail = normalizeText(account?.business_profile?.support_email).toLowerCase();
  if (supportEmail !== STRIPE_PUBLIC_SUPPORT_EMAIL) {
    findings.push(
      finding("error", "Stripe support email does not match the public Wireline inbox.", {
        expected: STRIPE_PUBLIC_SUPPORT_EMAIL,
        actual: supportEmail || null,
      }),
    );
  }

  if (!hasWirelineDescriptor(cardDescriptor.value)) {
    findings.push(
      finding("error", "Stripe card statement descriptor prefix is not Wireline-branded.", {
        expected_prefix: STRIPE_STATEMENT_DESCRIPTOR_PREFIX,
        actual: cardDescriptor.value || null,
        source: cardDescriptor.source,
      }),
    );
  }

  if (!hasWirelineDescriptor(paymentDescriptor)) {
    findings.push(
      finding("error", "Stripe payment statement descriptor is not Wireline-branded.", {
        expected_prefix: STRIPE_STATEMENT_DESCRIPTOR_PREFIX,
        actual: paymentDescriptor || null,
      }),
    );
  }

  const branding = account?.settings?.branding || {};
  if (!branding.logo) {
    findings.push(
      finding("warning", "Stripe-hosted surfaces have no rectangular account logo configured."),
    );
  }
  if (!branding.icon) {
    findings.push(
      finding("warning", "Stripe-hosted surfaces have no square account icon configured."),
    );
  }
  if (normalizeText(branding.primary_color).toUpperCase() !== STRIPE_BRAND_PRIMARY_COLOR) {
    findings.push(
      finding("error", "Stripe brand color does not match the Wireline design system.", {
        expected: STRIPE_BRAND_PRIMARY_COLOR,
        actual: normalizeText(branding.primary_color).toUpperCase() || null,
      }),
    );
  }
  if (normalizeText(branding.secondary_color).toUpperCase() !== STRIPE_BRAND_SECONDARY_COLOR) {
    findings.push(
      finding("error", "Stripe accent color does not match the Wireline design system.", {
        expected: STRIPE_BRAND_SECONDARY_COLOR,
        actual: normalizeText(branding.secondary_color).toUpperCase() || null,
      }),
    );
  }

  return findings;
}

export function stripeAccountIdentitySummary(account) {
  const profileIdentity = publicUrlIdentity(account?.business_profile?.url);
  const rawCardDescriptor = normalizeText(
    account?.settings?.card_payments?.statement_descriptor_prefix,
  );
  const effectiveCardDescriptor = effectiveStripeCardStatementDescriptor(account);
  return {
    business_profile_name: normalizeText(account?.business_profile?.name) || null,
    business_profile_host: profileIdentity.hostname || null,
    business_profile_protocol: profileIdentity.protocol || null,
    card_statement_descriptor_prefix: rawCardDescriptor || null,
    effective_card_statement_descriptor_prefix: effectiveCardDescriptor.value || null,
    card_statement_descriptor_prefix_source: effectiveCardDescriptor.source,
    payment_statement_descriptor:
      normalizeText(account?.settings?.payments?.statement_descriptor) || null,
    branding_logo_configured: Boolean(account?.settings?.branding?.logo),
    branding_icon_configured: Boolean(account?.settings?.branding?.icon),
  };
}
