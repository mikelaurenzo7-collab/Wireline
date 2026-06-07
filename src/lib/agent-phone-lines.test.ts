import { describe, it, expect } from "vitest";
import { isTwilioPhoneNumberSid, isVapiPhoneNumberId } from "./agent-phone-lines";

describe("agent-phone-lines", () => {
  it("detects Twilio vs Vapi carrier ids", () => {
    expect(isTwilioPhoneNumberSid("PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(isVapiPhoneNumberId("PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(isVapiPhoneNumberId("00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isVapiPhoneNumberId("")).toBe(false);
  });
});
