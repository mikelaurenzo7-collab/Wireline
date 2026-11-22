import { describe, expect, it, vi } from "vitest";

import {
  A2P_TRUST_PRODUCT_POLICY_SID,
  SECONDARY_CUSTOMER_PROFILE_POLICY_SID,
  composeCampaign,
  executeRegistration,
  planRegistration,
  resolveStep,
  validateBusinessDetails,
  type CustomerBusinessDetails,
  type RegistrationContext,
  type RegistrationHttp,
  type RegistrationSids,
} from "../src/lib/carrier-registration";

const details: CustomerBusinessDetails = {
  legalName: "Ridge Home Inspections LLC",
  brandName: "Ridge Inspections",
  businessType: "Limited Liability Corporation",
  industry: "PROFESSIONAL_SERVICES",
  ein: "12-3456789",
  websiteUrl: "https://ridgeinspections.example",
  privacyUrl: "https://ridgeinspections.example/privacy",
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
function fakeTwilio(options: { brandStatus?: string; evaluation?: string; failOn?: string } = {}) {
  const calls: Array<{ method: string; url: string; form?: Record<string, string | string[]> }> =
    [];
  let counter = 0;
  const http: RegistrationHttp = async (method, url, form) => {
    calls.push({ method, url, form });
    if (method === "GET")
      return { status: 200, body: { status: options.brandStatus ?? "APPROVED" } };
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
    expect(posts[0].form?.MessageSamples).toHaveLength(2);
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
