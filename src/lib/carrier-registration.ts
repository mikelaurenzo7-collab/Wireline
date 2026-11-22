/**
 * Per-business US texting registration through Twilio's ISV flow (A2P 10DLC,
 * Low-Volume Standard brand). A carrier Brand is the sending business, so each
 * customer business gets its own Secondary Customer Profile, A2P TrustProduct,
 * BrandRegistration, Messaging Service and campaign. BotBound's own approved
 * brand never covers another business's line.
 *
 * Source: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api
 * (read 2026-11-22). Registration fees are real money ($4.50 brand + $15
 * vetting, then a monthly campaign fee), so planning is pure and dry-run by
 * default; execution persists every created SID before the next step so a rerun
 * resumes instead of paying twice.
 *
 * No database state is required: the send path reads registration from Twilio
 * (`twilio-sms-registration.ts`). Once the line is in this business's
 * Messaging Service and the campaign is VERIFIED, texts send through it.
 */

export const SECONDARY_CUSTOMER_PROFILE_POLICY_SID = "RNdfbf3fae0e1107f8aded0e7cead80bf5";
export const A2P_TRUST_PRODUCT_POLICY_SID = "RNb0d4771c2c98518d916a3d4cd70a8f8b";

export const BUSINESS_TYPES = [
  "Sole Proprietorship",
  "Partnership",
  "Limited Liability Corporation",
  "Co-operative",
  "Non-profit Corporation",
  "Corporation",
] as const;

export const BUSINESS_INDUSTRIES = [
  "AUTOMOTIVE",
  "AGRICULTURE",
  "BANKING",
  "CONSTRUCTION",
  "CONSUMER",
  "EDUCATION",
  "ENGINEERING",
  "ENERGY",
  "FINANCIAL",
  "FOOD_AND_BEVERAGE",
  "HEALTHCARE",
  "HOSPITALITY",
  "INSURANCE",
  "LEGAL",
  "MANUFACTURING",
  "MEDIA",
  "ONLINE",
  "PROFESSIONAL_SERVICES",
  "REAL_ESTATE",
  "RETAIL",
  "TECHNOLOGY",
  "TRANSPORTATION",
  "TRAVEL",
] as const;

export const JOB_POSITIONS = [
  "Director",
  "GM",
  "VP",
  "CEO",
  "CFO",
  "General Counsel",
  "Other",
] as const;

export type CustomerBusinessDetails = {
  /** Legal name exactly as registered with the IRS for this EIN. */
  legalName: string;
  /** Name customers see in texts, for example "Ridge Inspections". */
  brandName: string;
  businessType: (typeof BUSINESS_TYPES)[number];
  industry: (typeof BUSINESS_INDUSTRIES)[number];
  /** Nine-digit US EIN; dashes are accepted and removed. */
  ein: string;
  websiteUrl: string;
  /** Page stating that mobile numbers and consent are not shared. */
  privacyUrl: string;
  address: { street: string; city: string; region: string; postalCode: string };
  representative: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    businessTitle: string;
    jobPosition: (typeof JOB_POSITIONS)[number];
  };
};

const E164_US = /^\+1\d{10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const US_REGION = /^[A-Z]{2}$/;
const US_ZIP = /^\d{5}(?:-\d{4})?$/;

function httpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeEin(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

/** Every problem at once, in the owner's words, so one correction pass fixes them all. */
export function validateBusinessDetails(details: CustomerBusinessDetails): string[] {
  const errors: string[] = [];
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  if (!text(details.legalName)) errors.push("Legal business name is required.");
  if (!text(details.brandName)) errors.push("Brand name is required.");
  if (!BUSINESS_TYPES.includes(details.businessType))
    errors.push(`Business type must be one of: ${BUSINESS_TYPES.join(", ")}.`);
  if (details.businessType === "Sole Proprietorship")
    errors.push("A sole proprietor without an EIN needs the Sole Proprietor flow, not this one.");
  if (!BUSINESS_INDUSTRIES.includes(details.industry))
    errors.push("Industry must be a Twilio industry code, for example PROFESSIONAL_SERVICES.");
  if (normalizeEin(details.ein).length !== 9) errors.push("EIN must have nine digits.");
  if (!httpsUrl(details.websiteUrl)) errors.push("Website must be an https:// address.");
  if (!httpsUrl(details.privacyUrl)) errors.push("Privacy policy must be an https:// address.");
  const address = details.address ?? ({} as CustomerBusinessDetails["address"]);
  if (!text(address.street) || !text(address.city)) errors.push("Street and city are required.");
  if (!US_REGION.test(String(address.region || "")))
    errors.push("State must be a two-letter code.");
  if (!US_ZIP.test(String(address.postalCode || "")))
    errors.push("ZIP code must have five digits.");
  const rep = details.representative ?? ({} as CustomerBusinessDetails["representative"]);
  if (!text(rep.firstName) || !text(rep.lastName))
    errors.push("Authorized representative's first and last name are required.");
  if (!EMAIL.test(String(rep.email || ""))) errors.push("Representative email is invalid.");
  if (!E164_US.test(String(rep.phone || "")))
    errors.push("Representative phone must be +1 and 10 digits.");
  if (!text(rep.businessTitle)) errors.push("Representative business title is required.");
  if (!JOB_POSITIONS.includes(rep.jobPosition))
    errors.push(`Representative job position must be one of: ${JOB_POSITIONS.join(", ")}.`);
  return errors;
}

export type ComposedCampaign = {
  description: string;
  messageFlow: string;
  messageSamples: [string, string];
  usecase: "LOW_VOLUME";
  hasEmbeddedLinks: true;
  hasEmbeddedPhone: false;
};

/**
 * The campaign describes what the Bot actually does: it asks a caller for
 * permission on the call before texting what they requested. The same flow
 * Twilio approved for BotBound's own campaign, with this business's name.
 */
export function composeCampaign(details: CustomerBusinessDetails): ComposedCampaign {
  const brand = details.brandName.trim();
  const legal = details.legalName.trim();
  const website = details.websiteUrl.trim();
  return {
    description: `${legal} uses this local number for non-promotional customer-care and appointment follow-up texts that its own customers and callers request. During a call with the ${brand} AI assistant, which identifies itself as AI when it answers, the caller asks for a text, and the assistant confirms the number and asks permission before sending.`,
    messageFlow: `During a phone call with the ${brand} AI assistant, which identifies itself as AI when it answers, a caller asks to receive information or an appointment confirmation by text. The assistant confirms the destination number and asks: "May ${brand} text the details to this number? Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help." A text is sent only after the caller agrees. Consent is not a condition of purchase and is never shared. Privacy policy: ${details.privacyUrl.trim()}`,
    messageSamples: [
      `${brand}: Here are the details you asked for on your call: ${website} Reply STOP to opt out, HELP for help.`,
      `${brand}: Your appointment is confirmed for Tuesday at 9:00 a.m. Reply STOP to opt out, HELP for help.`,
    ],
    usecase: "LOW_VOLUME",
    hasEmbeddedLinks: true,
    hasEmbeddedPhone: false,
  };
}

/** SIDs created so far. A present SID means that step already ran and is never repeated. */
export type RegistrationSids = Partial<{
  customerProfile: string;
  businessInfo: string;
  businessInfoAssigned: string;
  representative: string;
  representativeAssigned: string;
  address: string;
  supportingDocument: string;
  supportingDocumentAssigned: string;
  primaryProfileAssigned: string;
  customerProfileEvaluated: string;
  customerProfileSubmitted: string;
  trustProduct: string;
  messagingProfile: string;
  messagingProfileAssigned: string;
  trustProductProfileAssigned: string;
  trustProductEvaluated: string;
  trustProductSubmitted: string;
  brand: string;
  messagingService: string;
  campaign: string;
  phoneAttached: string;
}>;

export type RegistrationContext = {
  accountSid: string;
  /** BotBound's approved Primary Customer Profile (ISV reseller or partner). */
  primaryProfileSid: string;
  /** An address BotBound owns; Twilio sends review status there. Never the customer's. */
  isvNotificationEmail: string;
  /** IncomingPhoneNumber SID of the business's one line. */
  phoneNumberSid: string;
};

export type RegistrationGate = {
  /** Resource to read before the step; placeholders resolve like the step's. */
  url: string;
  /** Status values that let the step run. */
  ready: readonly string[];
  /** Status values that stop the run as a failure needing correction. */
  failed: readonly string[];
  waiting: string;
};

export type RegistrationStep = {
  key: keyof RegistrationSids;
  /** Owner-readable description for dry runs and logs. */
  label: string;
  method: "POST";
  url: string;
  /** Form fields; `{{sid:key}}` placeholders resolve from earlier steps' SIDs. */
  form: Record<string, string | string[]>;
  /** Charges the Twilio account. Execution pauses for explicit confirmation. */
  billable?: boolean;
  /** Twilio state that must be reached first; otherwise the run pauses to resume later. */
  gate?: RegistrationGate;
};

const TRUSTHUB = "https://trusthub.twilio.com/v1";
const MESSAGING = "https://messaging.twilio.com/v1";
const ref = (key: keyof RegistrationSids) => `{{sid:${key}}}`;

/** The full ordered plan, minus the steps whose SIDs already exist. */
export function planRegistration(
  details: CustomerBusinessDetails,
  context: RegistrationContext,
  done: RegistrationSids = {},
): RegistrationStep[] {
  const name = details.legalName.trim();
  const campaign = composeCampaign(details);
  const rep = details.representative;
  const steps: RegistrationStep[] = [
    {
      key: "customerProfile",
      label: "Create the business's Secondary Customer Profile",
      method: "POST",
      url: `${TRUSTHUB}/CustomerProfiles`,
      form: {
        FriendlyName: `${name} Secondary Customer Profile`,
        Email: context.isvNotificationEmail,
        PolicySid: SECONDARY_CUSTOMER_PROFILE_POLICY_SID,
      },
    },
    {
      key: "businessInfo",
      label: "Record business information",
      method: "POST",
      url: `${TRUSTHUB}/EndUsers`,
      form: {
        FriendlyName: `${name} Business Information`,
        Type: "customer_profile_business_information",
        Attributes: JSON.stringify({
          business_name: name,
          website_url: details.websiteUrl.trim(),
          business_regions_of_operation: "USA_AND_CANADA",
          business_type: details.businessType,
          business_registration_identifier: "EIN",
          business_identity: "direct_customer",
          business_industry: details.industry,
          business_registration_number: normalizeEin(details.ein),
        }),
      },
    },
    {
      key: "businessInfoAssigned",
      label: "Attach business information to the profile",
      method: "POST",
      url: `${TRUSTHUB}/CustomerProfiles/${ref("customerProfile")}/EntityAssignments`,
      form: { ObjectSid: ref("businessInfo") },
    },
    {
      key: "representative",
      label: "Record the authorized representative",
      method: "POST",
      url: `${TRUSTHUB}/EndUsers`,
      form: {
        FriendlyName: `${name} Authorized Representative 1`,
        Type: "authorized_representative_1",
        Attributes: JSON.stringify({
          first_name: rep.firstName.trim(),
          last_name: rep.lastName.trim(),
          email: rep.email.trim(),
          phone_number: rep.phone.trim(),
          business_title: rep.businessTitle.trim(),
          job_position: rep.jobPosition,
        }),
      },
    },
    {
      key: "representativeAssigned",
      label: "Attach the representative to the profile",
      method: "POST",
      url: `${TRUSTHUB}/CustomerProfiles/${ref("customerProfile")}/EntityAssignments`,
      form: { ObjectSid: ref("representative") },
    },
    {
      key: "address",
      label: "Record the business address",
      method: "POST",
      url: `https://api.twilio.com/2010-04-01/Accounts/${context.accountSid}/Addresses.json`,
      form: {
        CustomerName: name,
        Street: details.address.street.trim(),
        City: details.address.city.trim(),
        Region: details.address.region.trim(),
        PostalCode: details.address.postalCode.trim(),
        IsoCountry: "US",
      },
    },
    {
      key: "supportingDocument",
      label: "Record the address as a supporting document",
      method: "POST",
      url: `${TRUSTHUB}/SupportingDocuments`,
      form: {
        FriendlyName: `${name} Address`,
        Type: "customer_profile_address",
        Attributes: JSON.stringify({ address_sids: ref("address") }),
      },
    },
    {
      key: "supportingDocumentAssigned",
      label: "Attach the address to the profile",
      method: "POST",
      url: `${TRUSTHUB}/CustomerProfiles/${ref("customerProfile")}/EntityAssignments`,
      form: { ObjectSid: ref("supportingDocument") },
    },
    {
      key: "primaryProfileAssigned",
      label: "Link BotBound's primary profile as the ISV",
      method: "POST",
      url: `${TRUSTHUB}/CustomerProfiles/${ref("customerProfile")}/EntityAssignments`,
      form: { ObjectSid: context.primaryProfileSid },
    },
    {
      key: "customerProfileEvaluated",
      label: "Check the profile against Twilio's policy",
      method: "POST",
      url: `${TRUSTHUB}/CustomerProfiles/${ref("customerProfile")}/Evaluations`,
      form: { PolicySid: SECONDARY_CUSTOMER_PROFILE_POLICY_SID },
    },
    {
      key: "customerProfileSubmitted",
      label: "Submit the profile for review",
      method: "POST",
      url: `${TRUSTHUB}/CustomerProfiles/${ref("customerProfile")}`,
      form: { Status: "pending-review" },
    },
    {
      key: "trustProduct",
      label: "Create the A2P TrustProduct",
      method: "POST",
      url: `${TRUSTHUB}/TrustProducts`,
      form: {
        FriendlyName: `${name} A2P Trust Product`,
        Email: context.isvNotificationEmail,
        PolicySid: A2P_TRUST_PRODUCT_POLICY_SID,
      },
    },
    {
      key: "messagingProfile",
      label: "Record A2P messaging profile information",
      method: "POST",
      url: `${TRUSTHUB}/EndUsers`,
      form: {
        FriendlyName: `${name} Messaging Profile`,
        Type: "us_a2p_messaging_profile_information",
        Attributes: JSON.stringify({ company_type: "private" }),
      },
    },
    {
      key: "messagingProfileAssigned",
      label: "Attach the messaging profile to the TrustProduct",
      method: "POST",
      url: `${TRUSTHUB}/TrustProducts/${ref("trustProduct")}/EntityAssignments`,
      form: { ObjectSid: ref("messagingProfile") },
    },
    {
      key: "trustProductProfileAssigned",
      label: "Attach the customer profile to the TrustProduct",
      method: "POST",
      url: `${TRUSTHUB}/TrustProducts/${ref("trustProduct")}/EntityAssignments`,
      form: { ObjectSid: ref("customerProfile") },
    },
    {
      key: "trustProductEvaluated",
      label: "Check the TrustProduct against Twilio's policy",
      method: "POST",
      url: `${TRUSTHUB}/TrustProducts/${ref("trustProduct")}/Evaluations`,
      form: { PolicySid: A2P_TRUST_PRODUCT_POLICY_SID },
    },
    {
      key: "trustProductSubmitted",
      label: "Submit the TrustProduct for review",
      method: "POST",
      url: `${TRUSTHUB}/TrustProducts/${ref("trustProduct")}`,
      form: { Status: "pending-review" },
    },
    {
      key: "brand",
      label: "Register the Low-Volume Standard brand ($4.50)",
      method: "POST",
      url: `${MESSAGING}/a2p/BrandRegistrations`,
      form: {
        CustomerProfileBundleSid: ref("customerProfile"),
        A2PProfileBundleSid: ref("trustProduct"),
        SkipAutomaticSecVet: "true",
      },
      billable: true,
    },
    {
      key: "messagingService",
      label: "Create the business's Messaging Service",
      method: "POST",
      url: `${MESSAGING}/Services`,
      form: {
        FriendlyName: `${details.brandName.trim()} texting`,
        UseInboundWebhookOnNumber: "true",
      },
    },
    {
      key: "phoneAttached",
      label: "Add the business's line to its Messaging Service",
      method: "POST",
      url: `${MESSAGING}/Services/${ref("messagingService")}/PhoneNumbers`,
      form: { PhoneNumberSid: context.phoneNumberSid },
    },
    {
      key: "campaign",
      label: "Register the campaign ($15 vetting, then a monthly fee)",
      method: "POST",
      url: `${MESSAGING}/Services/${ref("messagingService")}/Compliance/Usa2p`,
      form: {
        BrandRegistrationSid: ref("brand"),
        Description: campaign.description,
        MessageFlow: campaign.messageFlow,
        MessageSamples: [...campaign.messageSamples],
        UsAppToPersonUsecase: campaign.usecase,
        HasEmbeddedLinks: String(campaign.hasEmbeddedLinks),
        HasEmbeddedPhone: String(campaign.hasEmbeddedPhone),
      },
      billable: true,
      // Twilio refuses a campaign until its brand is APPROVED (error 30994).
      gate: {
        url: `${MESSAGING}/a2p/BrandRegistrations/${ref("brand")}`,
        ready: ["APPROVED"],
        failed: ["FAILED", "SUSPENDED"],
        waiting: "Waiting for carriers to approve the brand. Rerun this command to continue.",
      },
    },
  ];
  return steps.filter((step) => !done[step.key]);
}

/** Replace `{{sid:key}}` placeholders; a missing earlier SID is a hard stop, never a blank. */
export function resolveStep(step: RegistrationStep, done: RegistrationSids): RegistrationStep {
  const fill = (value: string) =>
    value.replace(/\{\{sid:([A-Za-z]+)\}\}/g, (_match, key: keyof RegistrationSids) => {
      const sid = done[key];
      if (!sid) throw new Error(`Step "${step.key}" needs "${key}", which has not run yet.`);
      return sid;
    });
  return {
    ...step,
    url: fill(step.url),
    ...(step.gate ? { gate: { ...step.gate, url: fill(step.gate.url) } } : {}),
    form: Object.fromEntries(
      Object.entries(step.form).map(([field, value]) => [
        field,
        Array.isArray(value) ? value.map(fill) : fill(value),
      ]),
    ),
  };
}

export type RegistrationHttp = (
  method: "GET" | "POST",
  url: string,
  form?: Record<string, string | string[]>,
) => Promise<{ status: number; body: Record<string, unknown> }>;

export type ExecutionResult =
  | { ok: true; done: RegistrationSids }
  | { ok: false; done: RegistrationSids; failedStep: keyof RegistrationSids; reason: string }
  | { ok: false; done: RegistrationSids; pausedBefore: keyof RegistrationSids; reason: string };

/**
 * Run the remaining steps in order, persisting each SID before the next. An
 * evaluation that is not "compliant" stops the run with Twilio's reasons.
 * Billable steps run only when `allowBillable` is set.
 */
export async function executeRegistration(input: {
  details: CustomerBusinessDetails;
  context: RegistrationContext;
  done: RegistrationSids;
  http: RegistrationHttp;
  save: (done: RegistrationSids) => Promise<void>;
  allowBillable: boolean;
  pace?: () => Promise<void>;
}): Promise<ExecutionResult> {
  const done: RegistrationSids = { ...input.done };
  for (const planned of planRegistration(input.details, input.context, done)) {
    if (planned.billable && !input.allowBillable) {
      return {
        ok: false,
        done,
        pausedBefore: planned.key,
        reason: `Paused before a billable step: ${planned.label}. Rerun with billing confirmed.`,
      };
    }
    const step = resolveStep(planned, done);
    if (step.gate) {
      const gate = await input.http("GET", step.gate.url);
      const status = String(gate.body.status || "").toUpperCase();
      if (step.gate.failed.includes(status)) {
        const why =
          typeof gate.body.failure_reason === "string" ? `: ${gate.body.failure_reason}` : "";
        return { ok: false, done, failedStep: step.key, reason: `Twilio reports ${status}${why}` };
      }
      if (gate.status < 200 || gate.status >= 300 || !step.gate.ready.includes(status)) {
        return {
          ok: false,
          done,
          pausedBefore: step.key,
          reason: `${step.gate.waiting} Current status: ${status || `HTTP ${gate.status}`}.`,
        };
      }
    }
    const response = await input.http(step.method, step.url, step.form);
    if (response.status < 200 || response.status >= 300) {
      const message = typeof response.body.message === "string" ? response.body.message : "";
      return {
        ok: false,
        done,
        failedStep: step.key,
        reason: `${step.label} failed (HTTP ${response.status})${message ? `: ${message}` : ""}`,
      };
    }
    if (step.key.endsWith("Evaluated") && response.body.status !== "compliant") {
      return {
        ok: false,
        done,
        failedStep: step.key,
        reason: `${step.label}: ${String(response.body.status || "noncompliant")}. ${JSON.stringify(response.body.results ?? []).slice(0, 600)}`,
      };
    }
    const sid = typeof response.body.sid === "string" ? response.body.sid : "";
    // Submissions return the parent resource; record that the step ran.
    done[step.key] = sid || "done";
    await input.save(done);
    await input.pace?.();
  }
  return { ok: true, done };
}
