import { describe, expect, it, vi } from "vitest";

import {
  A2P_TRUST_PRODUCT_POLICY_SID,
  SECONDARY_CUSTOMER_PROFILE_POLICY_SID,
  SOLE_PROPRIETOR_TRUST_PRODUCT_POLICY_SID,
  STARTER_CUSTOMER_PROFILE_POLICY_SID,
  composeCampaign,
  composeSoleProprietorCampaign,
  executeRegistration,
  executeSoleProprietorRegistration,
  planRegistration,
  planSoleProprietorRegistration,
  resolveStep,
  validateBusinessDetails,
  type CustomerBusinessDetails,
  type RegistrationContext,
  type RegistrationHttp,
  type RegistrationSids,
  type SoleProprietorContext,
  type SoleProprietorDetails,
} from "../src/lib/carrier-registration";
import { MISSED_CALL_COVERAGE } from "../src/lib/twilio-sms-registration";

const details: CustomerBusinessDetails = {
  legalName: "Ridge Home Inspections LLC",
  brandName: "Ridge Inspections",
  businessType: "Limited Liability Corporation",
  industry: "PROFESSIONAL_SERVICES",
  ein: "12-3456789",
  websiteUrl: "https://ridgeinspections.example",
  privacyUrl: "https://ridgeinspections.example/privacy",
  termsUrl: "https://ridgeinspections.example/terms",
  address: { street: "100 Main St", city: "Springfield", region: "IL", postalCode: "62701" },
  representative: {
    firstName: "Dana",
    lastName: "Ridge",
    email: "dana@ridgeinspections.example",
    phone: "+12175550100",
    businessTitle: "Owner",
    jobPosition: "CEO",
  },
};

const context: RegistrationContext = {
  accountSid: "ACtest",
  primaryProfileSid: "BUprimary",
  isvNotificationEmail: "compliance@botbound.app",
  phoneNumberSid: "PNline",
};

/** A Twilio stand-in that mints SIDs and answers evaluations and the brand gate. */
function fakeTwilio(
  options: {
    brandStatus?: string;
    identityStatus?: string;
    evaluation?: string;
    failOn?: string;
  } = {},
) {
  const calls: Array<{ method: string; url: string; form?: Record<string, string | string[]> }> =
    [];
  let counter = 0;
  const http: RegistrationHttp = async (method, url, form) => {
    calls.push({ method, url, form });
    if (method === "GET")
      return {
        status: 200,
        body: {
          status: options.brandStatus ?? "APPROVED",
          identity_status: options.identityStatus ?? "VERIFIED",
        },
      };
    if (options.failOn && url.includes(options.failOn))
      return { status: 400, body: { message: "Invalid parameter" } };
    if (url.endsWith("/Evaluations"))
      return {
        status: 201,
        body: { sid: `EL${++counter}`, status: options.evaluation ?? "compliant" },
      };
    return { status: 201, body: { sid: `XX${++counter}` } };
  };
  return { http, calls };
}

describe("customer texting registration", () => {
  it("accepts complete details and lists every problem at once", () => {
    expect(validateBusinessDetails(details)).toEqual([]);
    const errors = validateBusinessDetails({
      ...details,
      ein: "123",
      websiteUrl: "http://insecure.example",
      address: { ...details.address, region: "Illinois", postalCode: "6270" },
      representative: { ...details.representative, phone: "217-555-0100" },
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        "EIN must have nine digits.",
        "Website must be an https:// address.",
        "State must be a two-letter code.",
        "ZIP code must have five digits.",
        "Representative phone must be +1 and 10 digits.",
      ]),
    );
  });

  it("sends sole proprietors without an EIN to their own flow", () => {
    expect(validateBusinessDetails({ ...details, businessType: "Sole Proprietorship" })).toContain(
      "A sole proprietor without an EIN needs the Sole Proprietor flow, not this one.",
    );
  });

  it("describes the Bot's real consent flow with STOP and HELP in every sample", () => {
    const campaign = composeCampaign(details);
    expect(campaign.usecase).toBe("LOW_VOLUME");
    expect(campaign.messageFlow).toContain(
      '"May Ridge Inspections text the details to this number?',
    );
    expect(campaign.messageFlow).toContain(details.privacyUrl);
    // Missed-call follow-up is described, so the send path may allow it.
    expect(MISSED_CALL_COVERAGE.test(`${campaign.description} ${campaign.messageFlow}`)).toBe(true);
    for (const sample of campaign.messageSamples) {
      expect(sample.startsWith("Ridge Inspections: ")).toBe(true);
      expect(sample).toContain("Reply STOP to opt out, HELP for help.");
    }
  });

  it("plans the ISV flow in order, with the line added before the campaign", () => {
    const keys = planRegistration(details, context).map((step) => step.key);
    expect(keys[0]).toBe("customerProfile");
    expect(keys.indexOf("customerProfileSubmitted")).toBeLessThan(keys.indexOf("trustProduct"));
    expect(keys.indexOf("trustProductSubmitted")).toBeLessThan(keys.indexOf("brand"));
    expect(keys.indexOf("phoneAttached")).toBeLessThan(keys.indexOf("campaign"));
    expect(keys.at(-1)).toBe("campaign");

    const steps = planRegistration(details, context);
    expect(steps[0].form.PolicySid).toBe(SECONDARY_CUSTOMER_PROFILE_POLICY_SID);
    expect(steps.find((step) => step.key === "trustProduct")!.form.PolicySid).toBe(
      A2P_TRUST_PRODUCT_POLICY_SID,
    );
    const business = JSON.parse(
      String(steps.find((step) => step.key === "businessInfo")!.form.Attributes),
    );
    expect(business).toMatchObject({
      business_registration_number: "123456789",
      business_identity: "direct_customer",
    });
    expect(steps.find((step) => step.key === "brand")).toMatchObject({ billable: true });
    expect(steps.find((step) => step.key === "brand")!.form.SkipAutomaticSecVet).toBe("true");
    // Twilio rejects a campaign without both policy links (30934, 30908, 30882),
    // and asks for the content flags; BotBound's own campaign failed without them.
    expect(steps.find((step) => step.key === "campaign")!.form).toMatchObject({
      PrivacyPolicyUrl: details.privacyUrl,
      TermsAndConditionsUrl: details.termsUrl,
      AgeGated: "false",
      DirectLending: "false",
    });
  });

  it("requires a terms of service page", () => {
    expect(validateBusinessDetails({ ...details, termsUrl: "" })).toContain(
      "Terms of service must be an https:// address.",
    );
  });

  it("skips steps already done and refuses to send an unresolved SID", () => {
    const done: RegistrationSids = { customerProfile: "BUcustomer", businessInfo: "ITbiz" };
    const steps = planRegistration(details, context, done);
    expect(steps[0].key).toBe("businessInfoAssigned");
    expect(resolveStep(steps[0], done).url).toContain(
      "/CustomerProfiles/BUcustomer/EntityAssignments",
    );
    expect(resolveStep(steps[0], done).form.ObjectSid).toBe("ITbiz");
    const later = steps.find((step) => step.key === "trustProductProfileAssigned")!;
    expect(() => resolveStep(later, done)).toThrow(/needs "trustProduct"/);
  });

  it("saves every SID as it goes and pauses before the first charge without confirmation", async () => {
    const twilio = fakeTwilio();
    const save = vi.fn(async () => undefined);
    const result = await executeRegistration({
      details,
      context,
      done: {},
      http: twilio.http,
      save,
      allowBillable: false,
    });
    expect(result).toMatchObject({ ok: false, pausedBefore: "brand" });
    expect(result.done.trustProductSubmitted).toBeTruthy();
    expect(result.done.brand).toBeUndefined();
    expect(save).toHaveBeenCalledTimes(17);
    expect(twilio.calls.some((call) => call.url.includes("BrandRegistrations"))).toBe(false);
  });

  it("waits for brand approval before the campaign and resumes without repeating work", async () => {
    const first = fakeTwilio({ brandStatus: "IN_REVIEW" });
    const paused = await executeRegistration({
      details,
      context,
      done: {},
      http: first.http,
      save: async () => undefined,
      allowBillable: true,
    });
    expect(paused).toMatchObject({ ok: false, pausedBefore: "campaign" });
    expect(paused.done.phoneAttached).toBeTruthy();
    expect(paused.ok === false && "reason" in paused ? paused.reason : "").toContain("IN_REVIEW");

    const second = fakeTwilio({ brandStatus: "APPROVED" });
    const finished = await executeRegistration({
      details,
      context,
      done: paused.done,
      http: second.http,
      save: async () => undefined,
      allowBillable: true,
    });
    expect(finished.ok).toBe(true);
    const posts = second.calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toContain("/Compliance/Usa2p");
    expect(posts[0].form?.MessageSamples).toHaveLength(3);
  });

  it("stops on a failed brand and on a noncompliant evaluation", async () => {
    const failedBrand = await executeRegistration({
      details,
      context,
      done: planRegistration(details, context)
        .filter((step) => step.key !== "campaign")
        .reduce<RegistrationSids>((acc, step) => ({ ...acc, [step.key]: `${step.key}-sid` }), {}),
      http: fakeTwilio({ brandStatus: "FAILED" }).http,
      save: async () => undefined,
      allowBillable: true,
    });
    expect(failedBrand).toMatchObject({ ok: false, failedStep: "campaign" });

    const noncompliant = await executeRegistration({
      details,
      context,
      done: {},
      http: fakeTwilio({ evaluation: "noncompliant" }).http,
      save: async () => undefined,
      allowBillable: false,
    });
    expect(noncompliant).toMatchObject({ ok: false, failedStep: "customerProfileEvaluated" });
  });
});

const sole: SoleProprietorDetails = {
  brandName: "Dana Fixes It",
  firstName: "Dana",
  lastName: "Ridge",
  email: "dana@example.com",
  mobilePhone: "+12175550111",
  vertical: "CONSTRUCTION",
  address: { street: "12 Elm St", city: "Springfield", region: "IL", postalCode: "62704" },
};

const soleContext: SoleProprietorContext = {
  accountSid: "ACtest",
  primaryProfileSid: "BUprimary",
  phoneNumberSid: "PNline",
  privacyUrl: "https://botbound.app/texting/token/privacy",
  termsUrl: "https://botbound.app/texting/token/terms",
};

describe("Sole Proprietor texting registration", () => {
  it("plans Twilio's Sole Proprietor flow with the owner's own email on both bundles", () => {
    const steps = planSoleProprietorRegistration(sole, soleContext);
    const keys = steps.map((step) => step.key);
    expect(keys[0]).toBe("customerProfile");
    expect(keys.indexOf("customerProfileSubmitted")).toBeLessThan(keys.indexOf("trustProduct"));
    expect(keys.indexOf("trustProductSubmitted")).toBeLessThan(keys.indexOf("brand"));
    expect(keys.indexOf("brand")).toBeLessThan(keys.indexOf("messagingService"));
    expect(keys.indexOf("phoneAttached")).toBeLessThan(keys.indexOf("campaign"));
    expect(keys).not.toContain("businessInfo");
    expect(keys).not.toContain("messagingProfile");

    const step = (key: keyof RegistrationSids) => steps.find((item) => item.key === key)!;
    expect(step("customerProfile").form).toMatchObject({
      Email: "dana@example.com",
      PolicySid: STARTER_CUSTOMER_PROFILE_POLICY_SID,
    });
    expect(step("trustProduct").form).toMatchObject({
      Email: "dana@example.com",
      PolicySid: SOLE_PROPRIETOR_TRUST_PRODUCT_POLICY_SID,
    });
    expect(JSON.parse(String(step("ownerInfo").form.Attributes))).toEqual({
      first_name: "Dana",
      last_name: "Ridge",
      email: "dana@example.com",
      phone_number: "+12175550111",
    });
    expect(step("ownerInfo").form.Type).toBe("starter_customer_profile_information");
    expect(JSON.parse(String(step("soleProprietorInfo").form.Attributes))).toEqual({
      brand_name: "Dana Fixes It",
      vertical: "CONSTRUCTION",
      mobile_phone_number: "+12175550111",
    });
    expect(step("soleProprietorInfo").form.Type).toBe("sole_proprietor_information");
    expect(step("primaryProfileAssigned").form.ObjectSid).toBe("BUprimary");
    expect(step("brand")).toMatchObject({ billable: true });
    expect(step("brand").form.BrandType).toBe("SOLE_PROPRIETOR");
    expect(step("brand").form.SkipAutomaticSecVet).toBeUndefined();
    expect(step("campaign")).toMatchObject({ billable: true });
    expect(step("campaign").form).toMatchObject({
      UsAppToPersonUsecase: "SOLE_PROPRIETOR",
      PrivacyPolicyUrl: soleContext.privacyUrl,
      TermsAndConditionsUrl: soleContext.termsUrl,
      HasEmbeddedLinks: "false",
    });
    // Twilio waits for an approved, owner-confirmed brand before the Messaging Service.
    for (const key of ["messagingService", "campaign"] as const) {
      expect(step(key).gate?.require).toMatchObject({
        field: "identity_status",
        ready: ["VERIFIED", "VETTED_VERIFIED"],
      });
    }
  });

  it("describes the same consent flow, linking only when the owner has a website", () => {
    const plain = composeSoleProprietorCampaign(sole, soleContext);
    expect(plain.hasEmbeddedLinks).toBe(false);
    expect(plain.messageFlow).toContain(soleContext.privacyUrl);
    expect(plain.messageFlow).toContain(soleContext.termsUrl);
    expect(MISSED_CALL_COVERAGE.test(`${plain.description} ${plain.messageFlow}`)).toBe(true);
    for (const sample of plain.messageSamples) {
      expect(sample.startsWith("Dana Fixes It: ")).toBe(true);
      expect(sample).not.toMatch(/https?:/);
      expect(sample).toContain("Reply STOP to opt out, HELP for help.");
    }
    const linked = composeSoleProprietorCampaign(
      { ...sole, websiteUrl: "https://danafixes.example" },
      soleContext,
    );
    expect(linked.hasEmbeddedLinks).toBe(true);
    expect(linked.messageSamples[0]).toContain("https://danafixes.example");
  });

  it("pauses before the brand fee, then waits for approval and the owner's YES", async () => {
    const unpaid = await executeSoleProprietorRegistration({
      details: sole,
      context: soleContext,
      done: {},
      http: fakeTwilio().http,
      save: async () => undefined,
      allowBillable: false,
    });
    expect(unpaid).toMatchObject({ ok: false, pausedBefore: "brand" });
    expect(unpaid.done.trustProductSubmitted).toBeTruthy();

    const reviewing = await executeSoleProprietorRegistration({
      details: sole,
      context: soleContext,
      done: unpaid.done,
      http: fakeTwilio({ brandStatus: "PENDING" }).http,
      save: async () => undefined,
      allowBillable: true,
    });
    expect(reviewing).toMatchObject({ ok: false, pausedBefore: "messagingService" });
    expect(reviewing.done.brand).toBeTruthy();

    const unconfirmed = fakeTwilio({ brandStatus: "APPROVED", identityStatus: "UNVERIFIED" });
    const waiting = await executeSoleProprietorRegistration({
      details: sole,
      context: soleContext,
      done: reviewing.done,
      http: unconfirmed.http,
      save: async () => undefined,
      allowBillable: true,
    });
    expect(waiting).toMatchObject({ ok: false, pausedBefore: "messagingService" });
    const reason = waiting.ok === false ? waiting.reason : "";
    expect(reason).toContain("reply YES");
    expect(reason).toContain("ending 0111");
    expect(reason).toContain("--resend-confirmation");
    expect(reason).toContain("UNVERIFIED");
    expect(unconfirmed.calls.some((call) => call.method === "POST")).toBe(false);

    const confirmed = fakeTwilio();
    const finished = await executeSoleProprietorRegistration({
      details: sole,
      context: soleContext,
      done: waiting.done,
      http: confirmed.http,
      save: async () => undefined,
      allowBillable: true,
    });
    expect(finished.ok).toBe(true);
    const posts = confirmed.calls.filter((call) => call.method === "POST");
    expect(posts.map((call) => call.url.split("/").slice(-2).join("/"))).toEqual([
      "v1/Services",
      expect.stringMatching(/PhoneNumbers$/),
      "Compliance/Usa2p",
    ]);
  });

  it("stops when carriers fail or expire the brand", async () => {
    const beforeService = planSoleProprietorRegistration(sole, soleContext)
      .slice(0, -3)
      .reduce<RegistrationSids>((acc, step) => ({ ...acc, [step.key]: `${step.key}-sid` }), {});
    for (const brandStatus of ["FAILED", "EXPIRED"]) {
      const result = await executeSoleProprietorRegistration({
        details: sole,
        context: soleContext,
        done: beforeService,
        http: fakeTwilio({ brandStatus }).http,
        save: async () => undefined,
        allowBillable: true,
      });
      expect(result).toMatchObject({ ok: false, failedStep: "messagingService" });
    }
  });

  it("refuses a state file from the other flow", () => {
    expect(() =>
      planSoleProprietorRegistration(sole, soleContext, { businessInfo: "ITbiz" }),
    ).toThrow(/different registration flow/);
    expect(() => planRegistration(details, context, { soleProprietorInfo: "ITsole" })).toThrow(
      /different registration flow/,
    );
  });
});
