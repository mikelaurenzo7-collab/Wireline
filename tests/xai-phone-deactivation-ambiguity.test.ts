import { describe, expect, it } from "vitest";

import { retainedXAIRegistrationError } from "../src/lib/voice/xai-phone-activation-service";

describe("xAI deactivation ambiguity retention", () => {
  it("preserves an unknown one-time registration result across retirement", () => {
    expect(retainedXAIRegistrationError("XAI_PHONE_REGISTRATION_OUTCOME_AMBIGUOUS")).toBe(
      "XAI_PHONE_REGISTRATION_OUTCOME_AMBIGUOUS",
    );
  });

  it.each([null, "NATIVE_PHONE_ACTIVATION_FAILED", "XAI_PHONE_DEACTIVATION_FAILED"])(
    "does not manufacture registration ambiguity from %s",
    (priorError) => {
      expect(retainedXAIRegistrationError(priorError)).toBeNull();
    },
  );
});
