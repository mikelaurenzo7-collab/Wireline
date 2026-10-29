/**
 * Twilio Trust Hub & Toll-Free Verification for BotBound (EIN 43-2610447)
 *
 * Implements entity mapping, schema validation, payload generation, and Twilio REST
 * client methods for US Toll-Free SMS profile registration and Trust Hub Bundles.
 */

export const BOTBOUND_EIN = "43-2610447";

export const BOTBOUND_TRUST_HUB_ENTITY = Object.freeze({
  businessName: "BotBound Inc.",
  brandName: "BotBound",
  ein: BOTBOUND_EIN,
  businessIdentityType: "DIRECT_CUSTOMER",
  businessType: "Corporation",
  website: "https://botbound.app",
  contactEmail: "compliance@botbound.app",
  supportEmail: "support@botbound.app",
  contactPhone: "+18005550199",
  authorizedRep: Object.freeze({
    firstName: "Michael",
    lastName: "Laurenzo",
    email: "compliance@botbound.app",
    phone: "+18005550199",
    title: "Authorized Representative",
  }),
  address: Object.freeze({
    street: "548 Market St",
    city: "San Francisco",
    region: "CA",
    postalCode: "94104",
    country: "US",
  }),
  useCases: Object.freeze(["CUSTOMER_CARE", "ACCOUNT_NOTIFICATIONS"]),
  useCaseSummary:
    "Transactional appointment confirmations, account security notifications, and customer support for BotBound platform users.",
  productionMessageSample:
    "Hi, this is BotBound confirming your appointment. Reply YES to confirm or STOP to unsubscribe.",
  optInWorkflowUrls: Object.freeze([
    "https://botbound.app/signup",
    "https://botbound.app/terms",
  ]),
  optInType: "WEB_FORM",
  messageVolume: "10,000",
});

/**
 * Validate US / North American Toll-Free Phone Number format.
 * Valid toll-free prefixes: 800, 888, 877, 866, 855, 844, 833.
 */
export function isTollFreePhoneNumber(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return /^\+1(800|888|877|866|855|844|833)\d{7}$/.test(normalized);
}

/**
 * Build payload for Twilio Trust Hub Customer Profile / Bundle.
 * https://trusthub.twilio.com/v1/CustomerProfiles
 */
export function buildTrustHubCustomerProfilePayload(options = {}) {
  const entity = { ...BOTBOUND_TRUST_HUB_ENTITY, ...options.entity };
  const callbackUrl =
    options.statusCallbackUrl ||
    "https://botbound.app/api/twilio-webhook/tollfree-verification-status";

  return {
    FriendlyName: `${entity.businessName} Customer Profile`,
    Email: entity.contactEmail,
    PolicySid: options.policySid || "RNdfbf3fae0e1107f87da2e1a30217b11e", // Primary Customer Profile Policy
    StatusCallback: callbackUrl,
    BusinessName: entity.businessName,
    BusinessRegistrationNumber: entity.ein,
    BusinessRegistrationType: "EIN",
    BusinessIdentityType: entity.businessIdentityType,
    BusinessIndustry: "TECHNOLOGY",
    Website: entity.website,
    Address: {
      Street: entity.address.street,
      City: entity.address.city,
      Region: entity.address.region,
      PostalCode: entity.address.postalCode,
      Country: entity.address.country,
    },
    AuthorizedRepresentative: {
      FirstName: entity.authorizedRep.firstName,
      LastName: entity.authorizedRep.lastName,
      Email: entity.authorizedRep.email,
      Phone: entity.authorizedRep.phone,
      Title: entity.authorizedRep.title,
    },
  };
}

/**
 * Build payload for Twilio Toll-Free Messaging Verification API.
 * https://messaging.twilio.com/v1/Tollfree/Verifications
 */
export function buildTollfreeVerificationPayload(options = {}) {
  const entity = { ...BOTBOUND_TRUST_HUB_ENTITY, ...options.entity };
  const phoneNumber = options.phoneNumber?.trim() || entity.contactPhone;
  const callbackUrl =
    options.statusCallbackUrl ||
    "https://botbound.app/api/twilio-webhook/tollfree-verification-status";

  const payload = {
    BusinessName: entity.businessName,
    BusinessWebsite: entity.website,
    NotificationEmail: entity.contactEmail,
    BusinessStreetAddress: entity.address.street,
    BusinessCity: entity.address.city,
    BusinessStateProvinceRegion: entity.address.region,
    BusinessPostalCode: entity.address.postalCode,
    BusinessCountry: entity.address.country,
    BusinessContactFirstName: entity.authorizedRep.firstName,
    BusinessContactLastName: entity.authorizedRep.lastName,
    BusinessContactEmail: entity.authorizedRep.email,
    BusinessContactPhone: entity.authorizedRep.phone,
    UseCaseCategories: [...entity.useCases],
    UseCaseSummary: entity.useCaseSummary,
    ProductionMessageSample: entity.productionMessageSample,
    OptInImageUrls: [...entity.optInWorkflowUrls],
    OptInType: entity.optInType,
    MessageVolume: entity.messageVolume,
    AdditionalInformation: `Tax ID / EIN: ${entity.ein}, Terms: https://botbound.app/terms, Privacy: https://botbound.app/privacy`,
    StatusCallback: callbackUrl,
  };

  if (options.customerProfileSid) {
    payload.CustomerProfileSid = options.customerProfileSid;
  }
  if (options.tollfreePhoneNumberSid) {
    payload.TollfreePhoneNumberSid = options.tollfreePhoneNumberSid;
  }
  if (phoneNumber) {
    payload.PhoneNumber = phoneNumber;
  }

  return payload;
}

/**
 * Validate Toll-Free verification payload against Twilio carrier compliance rules.
 */
export function validateTollfreeVerificationPayload(payload) {
  const errors = [];

  if (!payload.BusinessName || typeof payload.BusinessName !== "string") {
    errors.push("BusinessName is required.");
  }
  if (!payload.NotificationEmail || !payload.NotificationEmail.includes("@")) {
    errors.push("NotificationEmail must be a valid email.");
  }
  if (!payload.BusinessWebsite || !payload.BusinessWebsite.startsWith("https://")) {
    errors.push("BusinessWebsite must be a valid HTTPS URL.");
  }
  if (!payload.AdditionalInformation || !payload.AdditionalInformation.includes(BOTBOUND_EIN)) {
    errors.push(`AdditionalInformation must include EIN ${BOTBOUND_EIN}.`);
  }
  if (!Array.isArray(payload.UseCaseCategories) || payload.UseCaseCategories.length === 0) {
    errors.push("UseCaseCategories must contain at least one category.");
  }
  if (!payload.ProductionMessageSample || payload.ProductionMessageSample.length < 20) {
    errors.push("ProductionMessageSample must be a realistic message.");
  }
  if (
    !payload.ProductionMessageSample.toUpperCase().includes("STOP") &&
    !payload.ProductionMessageSample.toUpperCase().includes("UNSUBSCRIBE")
  ) {
    errors.push("ProductionMessageSample must provide opt-out keywords (e.g. STOP).");
  }
  if (!Array.isArray(payload.OptInImageUrls) || payload.OptInImageUrls.length === 0) {
    errors.push("OptInImageUrls must include at least one URL showing opt-in consent.");
  }
  if (payload.PhoneNumber && !isTollFreePhoneNumber(payload.PhoneNumber)) {
    errors.push(`PhoneNumber ${payload.PhoneNumber} is not a valid US toll-free number (must start with +1800, +1888, +1877, +1866, +1855, +1844, or +1833).`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Convert structured payload to URLSearchParams for Twilio REST endpoints.
 */
function toUrlSearchParams(payload) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
    } else if (typeof value === "object") {
      params.append(key, JSON.stringify(value));
    } else {
      params.append(key, String(value));
    }
  }
  return params;
}

/**
 * Twilio REST Basic Auth Header.
 */
function twilioBasicAuth(accountSid, authToken) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

/**
 * Submit Trust Hub Customer Profile to Twilio API.
 */
export async function submitTrustHubCustomerProfile(credentials, payload, options = {}) {
  const { accountSid, authToken } = credentials;
  if (!accountSid || !authToken) {
    throw new Error("Missing Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).");
  }

  const fetchFn = options.fetch || fetch;
  const url = options.url || "https://trusthub.twilio.com/v1/CustomerProfiles";

  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: toUrlSearchParams({
      FriendlyName: payload.FriendlyName,
      Email: payload.Email,
      PolicySid: payload.PolicySid,
      StatusCallback: payload.StatusCallback,
    }),
    signal: AbortSignal.timeout(options.timeoutMs || 20_000),
  });

  const bodyText = await response.text();
  const data = bodyText ? JSON.parse(bodyText) : {};
  if (!response.ok) {
    const errorMsg = data.message || `Twilio Trust Hub returned status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

/**
 * Submit Toll-Free Verification to Twilio Messaging API.
 */
export async function submitTollfreeVerification(credentials, payload, options = {}) {
  const { accountSid, authToken } = credentials;
  if (!accountSid || !authToken) {
    throw new Error("Missing Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).");
  }

  const validation = validateTollfreeVerificationPayload(payload);
  if (!validation.valid) {
    throw new Error(`Invalid Toll-Free verification payload: ${validation.errors.join("; ")}`);
  }

  const fetchFn = options.fetch || fetch;
  const url = options.url || "https://messaging.twilio.com/v1/Tollfree/Verifications";

  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuth(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: toUrlSearchParams(payload),
    signal: AbortSignal.timeout(options.timeoutMs || 20_000),
  });

  const bodyText = await response.text();
  const data = bodyText ? JSON.parse(bodyText) : {};
  if (!response.ok) {
    const errorMsg = data.message || `Twilio Toll-Free API returned status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

/**
 * Fetch Toll-Free Verification Status from Twilio Messaging API.
 */
export async function fetchTollfreeVerificationStatus(credentials, verificationSid, options = {}) {
  const { accountSid, authToken } = credentials;
  if (!accountSid || !authToken) {
    throw new Error("Missing Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).");
  }
  if (!verificationSid) {
    throw new Error("verificationSid is required.");
  }

  const fetchFn = options.fetch || fetch;
  const url =
    options.url ||
    `https://messaging.twilio.com/v1/Tollfree/Verifications/${encodeURIComponent(verificationSid)}`;

  const response = await fetchFn(url, {
    method: "GET",
    headers: {
      Authorization: twilioBasicAuth(accountSid, authToken),
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 15_000),
  });

  const bodyText = await response.text();
  const data = bodyText ? JSON.parse(bodyText) : {};
  if (!response.ok) {
    const errorMsg = data.message || `Twilio Toll-Free API returned status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}
