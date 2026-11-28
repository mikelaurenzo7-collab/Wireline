import { describe, expect, it } from "vitest";

import {
  checkoutReturnFlowFromSearch,
  checkoutReturnUrlWithoutProof,
  classifyCheckoutReturn,
  hasCheckoutReturnToVerify,
  shouldFinalizeCheckoutReturn,
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
});
