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
 * A business without an EIN takes the Sole Proprietor flow instead
 * (`planSoleProprietorRegistration`), with the same resumable, dry-run,
 * pay-only-when-confirmed execution.
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
  /** Terms of service page. Twilio requires both URLs on every campaign since June 30, 2026. */
  termsUrl: string;
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
  if (!httpsUrl(details.termsUrl)) errors.push("Terms of service must be an https:// address.");
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

/**
 * A sole proprietor without an EIN registers through Twilio's Sole Proprietor
 * flow: a Starter Customer Profile (policy RN806dd6cd175f314e1f96a9727ee271f4),
 * a Sole Proprietor A2P TrustProduct (policy RN670d5d2e282a6130ae063b234b6019c8),
 * a SOLE_PROPRIETOR brand verified by the owner replying YES to a text from
 * The Campaign Registry, then one campaign with exactly one number.
 *
 * Source: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api-sole-prop-new
 * (read 2026-11-23 through Twilio's documentation search). The verification
 * mobile must be the owner's own phone, never a Twilio or other CPaaS number,
 * and TCR allows each mobile at most three Sole Proprietor brands. Both
 * bundles carry the owner's own email (Twilio validates it, and TCR allows
 * one address on at most ten brands), never BotBound's ISV address.
 *
 * Fees: $4.50 brand, then $15 campaign vetting and $2 a month. Carriers text
 * the owner from 915-278-2000 once the brand is APPROVED; replying YES within
 * 24 hours turns `identity_status` VERIFIED, and only then may the Messaging
 * Service and campaign be created. A missed reply needs a fresh text
 * (`SmsOtp`), and TCR may expire a brand still unverified after 30 days.
 */
export const STARTER_CUSTOMER_PROFILE_POLICY_SID = "RN806dd6cd175f314e1f96a9727ee271f4";
export const SOLE_PROPRIETOR_TRUST_PRODUCT_POLICY_SID = "RN670d5d2e282a6130ae063b234b6019c8";

/**
 * Twilio's `vertical` values for `sole_proprietor_information`, a different
 * list from BUSINESS_INDUSTRIES. GAMBLING, GOVERNMENT, NGO, POLITICAL and
 * POSTAL are left out: BotBound does not serve those senders.
 */
export const SOLE_PROPRIETOR_VERTICALS = [
  "AGRICULTURE",
  "COMMUNICATION",
  "CONSTRUCTION",
  "EDUCATION",
  "ENERGY",
  "ENTERTAINMENT",
  "FINANCIAL",
  "HEALTHCARE",
  "HOSPITALITY",
  "HUMAN_RESOURCES",
  "INSURANCE",
  "LEGAL",
  "MANUFACTURING",
  "PROFESSIONAL",
  "REAL_ESTATE",
  "RETAIL",
  "TECHNOLOGY",
  "TRANSPORTATION",
] as const;

export type SoleProprietorDetails = {
  /** Name customers see in texts; usually the owner's name or trade name. */
  brandName: string;
  firstName: string;
  lastName: string;
  email: string;
  /** The owner's own mobile. Carriers text it a YES confirmation. */
  mobilePhone: string;
  vertical: (typeof SOLE_PROPRIETOR_VERTICALS)[number];
  address: CustomerBusinessDetails["address"];
  /** Optional; a campaign reads better with one. */
  websiteUrl?: string;
};

/** Every problem at once, in the owner's words. `blockedNumbers` are lines BotBound or Twilio provided. */
export function validateSoleProprietorDetails(
  details: SoleProprietorDetails,
  options: { blockedNumbers?: readonly string[] } = {},
): string[] {
  const errors: string[] = [];
  const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  if (!text(details.brandName)) errors.push("Brand name is required.");
  if (!text(details.firstName) || !text(details.lastName))
    errors.push("Your first and last name are required.");
  if (!EMAIL.test(String(details.email || ""))) errors.push("Email is invalid.");
  const mobile = String(details.mobilePhone || "");
  if (!E164_US.test(mobile)) errors.push("Mobile number must be +1 and 10 digits.");
  else if (options.blockedNumbers?.includes(mobile))
    errors.push("Use your own cell phone for the carrier confirmation text, not a BotBound line.");
  if (!SOLE_PROPRIETOR_VERTICALS.includes(details.vertical))
    errors.push("Choose the kind of work you do.");
  const address = details.address ?? ({} as CustomerBusinessDetails["address"]);
  if (!text(address.street) || !text(address.city)) errors.push("Street and city are required.");
  if (!US_REGION.test(String(address.region || "")))
    errors.push("State must be a two-letter code.");
  if (!US_ZIP.test(String(address.postalCode || "")))
    errors.push("ZIP code must have five digits.");
  if (details.websiteUrl && !httpsUrl(details.websiteUrl))
    errors.push("Website must be an https:// address.");
  return errors;
}

export type ComposedCampaign = {
  description: string;
  messageFlow: string;
  messageSamples: [string, string, string];
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
    description: `${legal} uses this local number for non-promotional customer-care and appointment follow-up texts that its own customers and callers request. During a call with the ${brand} AI assistant, which identifies itself as AI when it answers, the caller asks for a text, and the assistant confirms the number and asks permission before sending. When a caller's call is missed, the business may send that caller one text offering help.`,
    messageFlow: `During a phone call with the ${brand} AI assistant, which identifies itself as AI when it answers, a caller asks to receive information or an appointment confirmation by text. The assistant confirms the destination number and asks: "May ${brand} text the details to this number? Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help." A text is sent only after the caller agrees. When a caller's call is missed, the business may send that one caller a single reply offering help, with opt-out instructions; it never texts numbers that did not call. Consent is not a condition of purchase and is never shared. Privacy policy: ${details.privacyUrl.trim()} Terms: ${details.termsUrl.trim()}`,
    messageSamples: [
      `${brand}: Here are the details you asked for on your call: ${website} Reply STOP to opt out, HELP for help.`,
      `${brand}: Your appointment is confirmed for Tuesday at 9:00 a.m. Reply STOP to opt out, HELP for help.`,
      `${brand}: Sorry we missed your call. Reply here or call back anytime and we'll help. Reply STOP to opt out, HELP for help.`,
    ],
    usecase: "LOW_VOLUME",
    hasEmbeddedLinks: true,
    hasEmbeddedPhone: false,
  };
}

/**
 * The Sole Proprietor campaign: the same consent flow, named for the owner's
 * brand. Without a website the first sample carries no link, and the policy
 * URLs are the pages BotBound hosts for the brand (`texting-policy-link.ts`).
 */
export function composeSoleProprietorCampaign(
  details: SoleProprietorDetails,
  policy: { privacyUrl: string; termsUrl: string },
): Omit<ComposedCampaign, "usecase" | "hasEmbeddedLinks"> & {
  usecase: "SOLE_PROPRIETOR";
  hasEmbeddedLinks: boolean;
} {
  const brand = details.brandName.trim();
  const website = details.websiteUrl?.trim() || "";
  return {
    description: `${brand} is a sole proprietor that uses this local number for non-promotional customer-care and appointment follow-up texts its own callers request. During a call with the ${brand} AI assistant, which identifies itself as AI when it answers, the caller asks for a text, and the assistant confirms the number and asks permission before sending. When a caller's call is missed, ${brand} may send that caller one text offering help.`,
    messageFlow: `During a phone call with the ${brand} AI assistant, which identifies itself as AI when it answers, a caller asks to receive information or an appointment confirmation by text. The assistant confirms the destination number and asks: "May ${brand} text the details to this number? Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help." A text is sent only after the caller agrees. When a caller's call is missed, ${brand} may send that one caller a single reply offering help, with opt-out instructions; it never texts numbers that did not call. Consent is not a condition of purchase and is never shared. Privacy policy: ${policy.privacyUrl} Terms: ${policy.termsUrl}`,
    messageSamples: [
      website
        ? `${brand}: Here are the details you asked for on your call: ${website} Reply STOP to opt out, HELP for help.`
        : `${brand}: Here are the details you asked for on your call. Reply here with any questions. Reply STOP to opt out, HELP for help.`,
      `${brand}: Your appointment is confirmed for Tuesday at 9:00 a.m. Reply STOP to opt out, HELP for help.`,
      `${brand}: Sorry we missed your call. Reply here or call back anytime and we'll help. Reply STOP to opt out, HELP for help.`,
    ],
    usecase: "SOLE_PROPRIETOR",
    hasEmbeddedLinks: Boolean(website),
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
  /** Sole Proprietor only: the owner on the Starter Customer Profile. */
  ownerInfo: string;
  ownerInfoAssigned: string;
  primaryProfileAssigned: string;
  customerProfileEvaluated: string;
  customerProfileSubmitted: string;
  trustProduct: string;
  messagingProfile: string;
  messagingProfileAssigned: string;
  /** Sole Proprietor only: brand name, vertical and verification mobile. */
  soleProprietorInfo: string;
  soleProprietorInfoAssigned: string;
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
  /** A second field that must also be ready, such as a Sole Proprietor brand's `identity_status`. */
  require?: { field: string; ready: readonly string[]; waiting: string };
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

const BUSINESS_ONLY_KEYS: readonly (keyof RegistrationSids)[] = [
  "businessInfo",
  "businessInfoAssigned",
  "representative",
  "representativeAssigned",
  "messagingProfile",
  "messagingProfileAssigned",
];
const SOLE_PROPRIETOR_ONLY_KEYS: readonly (keyof RegistrationSids)[] = [
  "ownerInfo",
  "ownerInfoAssigned",
  "soleProprietorInfo",
  "soleProprietorInfoAssigned",
];

/** A state file from the other flow would attach the wrong bundles; refuse it outright. */
function assertStateFlow(
  done: RegistrationSids,
  foreign: readonly (keyof RegistrationSids)[],
  flow: string,
) {
  const mixed = foreign.filter((key) => done[key]);
  if (mixed.length) {
    throw new Error(
      `This state file belongs to a different registration flow (it has ${mixed.join(", ")}); use a new state file for the ${flow} flow.`,
    );
  }
}

/** The full ordered plan, minus the steps whose SIDs already exist. */
export function planRegistration(
  details: CustomerBusinessDetails,
  context: RegistrationContext,
  done: RegistrationSids = {},
): RegistrationStep[] {
  assertStateFlow(done, SOLE_PROPRIETOR_ONLY_KEYS, "business");
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
        // Required since June 30, 2026 (errors 30934, 30908, 30882 when missing or wrong).
        PrivacyPolicyUrl: details.privacyUrl.trim(),
        TermsAndConditionsUrl: details.termsUrl.trim(),
        AgeGated: "false",
        DirectLending: "false",
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

export type SoleProprietorContext = Omit<RegistrationContext, "isvNotificationEmail"> & {
  /** Texting privacy policy and terms for the brand, usually the pages BotBound hosts. */
  privacyUrl: string;
  termsUrl: string;
};

/**
 * Twilio's Sole Proprietor ISV flow, in order, minus finished steps: Starter
 * Customer Profile, Sole Proprietor TrustProduct, SOLE_PROPRIETOR brand, then
 * (once the owner has confirmed by text) the Messaging Service, the line and
 * the campaign.
 */
export function planSoleProprietorRegistration(
  details: SoleProprietorDetails,
  context: SoleProprietorContext,
  done: RegistrationSids = {},
): RegistrationStep[] {
  assertStateFlow(done, BUSINESS_ONLY_KEYS, "Sole Proprietor");
  const owner = `${details.firstName.trim()} ${details.lastName.trim()}`;
  const email = details.email.trim();
  const brand = details.brandName.trim();
  const campaign = composeSoleProprietorCampaign(details, context);
  const verified: RegistrationGate = {
    url: `${MESSAGING}/a2p/BrandRegistrations/${ref("brand")}`,
    ready: ["APPROVED"],
    failed: ["FAILED", "SUSPENDED", "EXPIRED", "DELETED"],
    waiting: "Waiting for carriers to approve the brand. Rerun this command to continue.",
    require: {
      field: "identity_status",
      ready: ["VERIFIED", "VETTED_VERIFIED"],
      waiting: `Waiting for ${details.firstName.trim()} to reply YES to the carrier text from 915-278-2000 on the mobile ending ${details.mobilePhone.slice(-4)}. That text expires after 24 hours; rerun with --resend-confirmation to send a fresh one.`,
    },
  };
  const steps: RegistrationStep[] = [
    {
      key: "customerProfile",
      label: "Create the owner's Starter Customer Profile",
      method: "POST",
      url: `${TRUSTHUB}/CustomerProfiles`,
      form: {
        FriendlyName: `${owner} Starter Customer Profile`,
        Email: email,
        PolicySid: STARTER_CUSTOMER_PROFILE_POLICY_SID,
      },
    },
    {
      key: "ownerInfo",
      label: "Record the owner's contact details",
      method: "POST",
      url: `${TRUSTHUB}/EndUsers`,
      form: {
        FriendlyName: `${owner} Starter Profile Information`,
        Type: "starter_customer_profile_information",
        Attributes: JSON.stringify({
          first_name: details.firstName.trim(),
          last_name: details.lastName.trim(),
          email,
          phone_number: details.mobilePhone.trim(),
        }),
      },
    },
    {
      key: "ownerInfoAssigned",
      label: "Attach the owner's details to the profile",
      method: "POST",
      url: `${TRUSTHUB}/CustomerProfiles/${ref("customerProfile")}/EntityAssignments`,
      form: { ObjectSid: ref("ownerInfo") },
    },
    {
      key: "address",
      label: "Record the owner's address",
      method: "POST",
      url: `https://api.twilio.com/2010-04-01/Accounts/${context.accountSid}/Addresses.json`,
      form: {
        CustomerName: owner,
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
        FriendlyName: `${owner} Address`,
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
      form: { PolicySid: STARTER_CUSTOMER_PROFILE_POLICY_SID },
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
      label: "Create the Sole Proprietor TrustProduct",
      method: "POST",
      url: `${TRUSTHUB}/TrustProducts`,
      form: {
        FriendlyName: `${owner} Sole Proprietor A2P Trust Bundle`,
        Email: email,
        PolicySid: SOLE_PROPRIETOR_TRUST_PRODUCT_POLICY_SID,
      },
    },
    {
      key: "soleProprietorInfo",
      label: "Record the brand name, kind of work and verification mobile",
      method: "POST",
      url: `${TRUSTHUB}/EndUsers`,
      form: {
        FriendlyName: `${owner} Sole Proprietor Information`,
        Type: "sole_proprietor_information",
        Attributes: JSON.stringify({
          brand_name: brand,
          vertical: details.vertical,
          mobile_phone_number: details.mobilePhone.trim(),
        }),
      },
    },
    {
      key: "soleProprietorInfoAssigned",
      label: "Attach the brand details to the TrustProduct",
      method: "POST",
      url: `${TRUSTHUB}/TrustProducts/${ref("trustProduct")}/EntityAssignments`,
      form: { ObjectSid: ref("soleProprietorInfo") },
    },
    {
      key: "trustProductProfileAssigned",
      label: "Attach the Starter profile to the TrustProduct",
      method: "POST",
      url: `${TRUSTHUB}/TrustProducts/${ref("trustProduct")}/EntityAssignments`,
      form: { ObjectSid: ref("customerProfile") },
    },
    {
      key: "trustProductEvaluated",
      label: "Check the TrustProduct against Twilio's policy",
      method: "POST",
      url: `${TRUSTHUB}/TrustProducts/${ref("trustProduct")}/Evaluations`,
      form: { PolicySid: SOLE_PROPRIETOR_TRUST_PRODUCT_POLICY_SID },
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
      label: "Register the Sole Proprietor brand ($4.50); carriers then text the owner to confirm",
      method: "POST",
      url: `${MESSAGING}/a2p/BrandRegistrations`,
      form: {
        CustomerProfileBundleSid: ref("customerProfile"),
        A2PProfileBundleSid: ref("trustProduct"),
        BrandType: "SOLE_PROPRIETOR",
      },
      billable: true,
    },
    {
      key: "messagingService",
      label: "Create the owner's Messaging Service",
      method: "POST",
      url: `${MESSAGING}/Services`,
      form: { FriendlyName: `${brand} texting`, UseInboundWebhookOnNumber: "true" },
      // Twilio's walkthrough waits for an approved, verified brand before this step.
      gate: verified,
    },
    {
      key: "phoneAttached",
      label:
        "Add the owner's line to its Messaging Service (a Sole Proprietor campaign holds one number)",
      method: "POST",
      url: `${MESSAGING}/Services/${ref("messagingService")}/PhoneNumbers`,
      form: { PhoneNumberSid: context.phoneNumberSid },
    },
    {
      key: "campaign",
      label: "Register the campaign ($15 vetting, then $2 a month)",
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
        PrivacyPolicyUrl: context.privacyUrl,
        TermsAndConditionsUrl: context.termsUrl,
        AgeGated: "false",
        DirectLending: "false",
      },
      billable: true,
      gate: verified,
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

type ExecutionIo = {
  done: RegistrationSids;
  http: RegistrationHttp;
  save: (done: RegistrationSids) => Promise<void>;
  allowBillable: boolean;
  pace?: () => Promise<void>;
};

/** Run the business (EIN) flow. See `executeRegistrationSteps`. */
export function executeRegistration(
  input: ExecutionIo & { details: CustomerBusinessDetails; context: RegistrationContext },
): Promise<ExecutionResult> {
  return executeRegistrationSteps({
    ...input,
    plan: (done) => planRegistration(input.details, input.context, done),
  });
}

/** Run the Sole Proprietor flow. See `executeRegistrationSteps`. */
export function executeSoleProprietorRegistration(
  input: ExecutionIo & { details: SoleProprietorDetails; context: SoleProprietorContext },
): Promise<ExecutionResult> {
  return executeRegistrationSteps({
    ...input,
    plan: (done) => planSoleProprietorRegistration(input.details, input.context, done),
  });
}

/**
 * Run the remaining steps in order, persisting each SID before the next. An
 * evaluation that is not "compliant" stops the run with Twilio's reasons.
 * Billable steps run only when `allowBillable` is set.
 */
export async function executeRegistrationSteps(
  input: ExecutionIo & { plan: (done: RegistrationSids) => RegistrationStep[] },
): Promise<ExecutionResult> {
  const done: RegistrationSids = { ...input.done };
  for (const planned of input.plan(done)) {
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
      const also = step.gate.require;
      const value = also ? String(gate.body[also.field] || "").toUpperCase() : "";
      if (also && !also.ready.includes(value)) {
        return {
          ok: false,
          done,
          pausedBefore: step.key,
          reason: `${also.waiting} Current ${also.field}: ${value || "unknown"}.`,
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
