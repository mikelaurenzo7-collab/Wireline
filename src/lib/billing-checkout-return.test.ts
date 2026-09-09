import { describe, expect, it } from "vitest";

import {
  activatedPostCreateWizard,
  checkoutReturnFlowFromSearch,
  checkoutReturnUrlWithoutProof,
  classifyCheckoutReturn,
  hasCheckoutReturnToVerify,
  shouldFinalizeCheckoutReturn,
  shouldResumePostCreateLaunch,
} from "./billing-checkout-return";

describe("billing Checkout return recovery", () => {
  it("recognizes every active Checkout return marker", () => {
    expect(checkoutReturnFlowFromSearch("?billing=success&session_id=cs_1")).toBe("plan");
    expect(checkoutReturnFlowFromSearch("?balance=success&session_id=cs_2")).toBe(
      "runtime_balance",
    );
    expect(checkoutReturnFlowFromSearch("?credits=success&session_id=cs_3")).toBe(
      "runtime_balance",
    );
    expect(checkoutReturnFlowFromSearch("?live_video=success&session_id=cs_4")).toBe("live_video");
    expect(hasCheckoutReturnToVerify("?billing=success")).toBe(false);
    expect(hasCheckoutReturnToVerify("?billing=success&session_id=cs_1")).toBe(true);
  });

  it("finalizes only after the requested entitlement is fulfilled", () => {
    expect(classifyCheckoutReturn("plan", 200, { payment_status: "paid", synced: true })).toBe(
      "fulfilled",
    );
    expect(
      classifyCheckoutReturn("runtime_balance", 200, {
        payment_status: "paid",
        credit_granted: true,
      }),
    ).toBe("fulfilled");
    expect(classifyCheckoutReturn("plan", 200, { payment_status: "paid", synced: false })).toBe(
      "retryable",
    );
  });

  it("finalizes retired Live Video returns after payment reconciliation", () => {
    expect(
      classifyCheckoutReturn("live_video", 200, {
        payment_status: "paid",
        live_video_enabled: false,
      }),
    ).toBe("retired");
    expect(
      classifyCheckoutReturn("live_video", 200, {
        payment_status: "no_payment_required",
        live_video_enabled: false,
      }),
    ).toBe("retired");
    expect(shouldFinalizeCheckoutReturn("retired")).toBe(true);
  });

  it("keeps delayed and transient outcomes retryable", () => {
    expect(classifyCheckoutReturn("plan", 200, { payment_status: "unpaid" })).toBe("pending");
    expect(classifyCheckoutReturn("plan", null, null)).toBe("retryable");
    expect(classifyCheckoutReturn("plan", 503, null)).toBe("retryable");
    expect(classifyCheckoutReturn("plan", 401, null)).toBe("retryable");
    expect(shouldFinalizeCheckoutReturn("pending")).toBe(false);
    expect(shouldFinalizeCheckoutReturn("retryable")).toBe(false);
  });

  it("finalizes an expired unpaid session so refreshes do not retry forever", () => {
    expect(
      classifyCheckoutReturn("plan", 200, {
        status: "expired",
        payment_status: "unpaid",
      }),
    ).toBe("expired");
    expect(shouldFinalizeCheckoutReturn("expired")).toBe(true);
  });

  it("scrubs only definitively invalid references", () => {
    expect(classifyCheckoutReturn("plan", 400, null)).toBe("invalid");
    expect(classifyCheckoutReturn("plan", 404, null)).toBe("invalid");
    expect(shouldFinalizeCheckoutReturn("invalid")).toBe(true);
    expect(shouldFinalizeCheckoutReturn("fulfilled")).toBe(true);
  });

  it("preserves unrelated query state and the fragment when proof is scrubbed", () => {
    expect(
      checkoutReturnUrlWithoutProof(
        "/settings/billing",
        "?billing=success&session_id=cs_1&plan=starter&tab=usage",
        "#invoice",
      ),
    ).toBe("/settings/billing?plan=starter&tab=usage#invoice");
  });

  it("resumes only a fulfilled plan Checkout that interrupted the Launch step", () => {
    expect(shouldResumePostCreateLaunch("plan", "fulfilled", true, "launch")).toBe(true);
    expect(shouldResumePostCreateLaunch("plan", "fulfilled", true, "wire")).toBe(true);
    expect(shouldResumePostCreateLaunch("runtime_balance", "fulfilled", true, "launch")).toBe(
      false,
    );
    expect(shouldResumePostCreateLaunch("plan", "pending", true, "launch")).toBe(false);
    expect(shouldResumePostCreateLaunch("plan", "fulfilled", false, "launch")).toBe(false);
    expect(shouldResumePostCreateLaunch("plan", "fulfilled", true, "test")).toBe(false);
  });
});

describe("saved launch guide after plan fulfillment", () => {
  const savedWizard = Object.freeze({
    agentId: "bot_checkout",
    agentName: "Reception",
    phoneProvisionRequested: true,
    phoneProvisioned: false,
    phoneActivationRequired: true,
    phoneNumber: null,
    emailProvisionRequested: true,
    emailProvisioned: true,
    emailAddress: "reception@example.test",
    identityBootstrapComplete: true,
  });

  it("clears the old activation rejection while preserving completed identity work", () => {
    expect(
      activatedPostCreateWizard("plan", "fulfilled", savedWizard.agentId, savedWizard, "launch"),
    ).toEqual({ ...savedWizard, phoneActivationRequired: false });
    expect(savedWizard.phoneActivationRequired).toBe(true);
  });

  it.each(["pending", "invalid", "expired", "retryable", "retired"] as const)(
    "leaves the guide untouched for a %s checkout",
    (outcome) => {
      expect(
        activatedPostCreateWizard("plan", outcome, savedWizard.agentId, savedWizard, "launch"),
      ).toBeNull();
      expect(savedWizard.phoneActivationRequired).toBe(true);
    },
  );

  it("does not treat a Runtime Balance purchase as plan activation", () => {
    expect(
      activatedPostCreateWizard(
        "runtime_balance", "fulfilled", savedWizard.agentId, savedWizard, "launch",
      ),
    ).toBeNull();
  });

  it("does not resume a different Bot selected while checkout verification was pending", () => {
    const differentWizard = { ...savedWizard, agentId: "bot_new", agentName: "Sales" };
    expect(
      activatedPostCreateWizard(
        "plan", "fulfilled", savedWizard.agentId, differentWizard, "launch",
      ),
    ).toBeNull();
    expect(differentWizard.phoneActivationRequired).toBe(true);
  });

  it("does not revive a dismissed guide or resume a newly opened one", () => {
    expect(
      activatedPostCreateWizard("plan", "fulfilled", savedWizard.agentId, null, "launch"),
    ).toBeNull();
    expect(
      activatedPostCreateWizard("plan", "fulfilled", null, savedWizard, "launch"),
    ).toBeNull();
  });

  it.each(["train", "test", null])("does not move the saved %s step to Launch", (step) => {
    expect(
      activatedPostCreateWizard("plan", "fulfilled", savedWizard.agentId, savedWizard, step),
    ).toBeNull();
  });

  it("accepts the legacy wire step without resetting completed bootstrap state", () => {
    expect(
      activatedPostCreateWizard("plan", "fulfilled", savedWizard.agentId, savedWizard, "wire"),
    ).toEqual({ ...savedWizard, phoneActivationRequired: false });
  });
});
