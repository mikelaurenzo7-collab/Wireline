import { describe, it, expect } from "vitest";
import { formatVapiCallError } from "./vapi-client";
import { mapOutboundVoiceRole } from "./vapi-helpers";

describe("mapOutboundVoiceRole", () => {
  it("maps Wireline persona roles to voice-runtime keys", () => {
    expect(mapOutboundVoiceRole("wireline_sales")).toBe("sales");
    expect(mapOutboundVoiceRole("wireline_reception")).toBe("receptionist");
    expect(mapOutboundVoiceRole("customer_service")).toBe("customer_service");
  });
});

describe("formatVapiCallError", () => {
  it("extracts message from Vapi JSON errors", () => {
    expect(
      formatVapiCallError(
        JSON.stringify({ message: ["customer.number must be a valid E.164 phone number"] }),
      ),
    ).toContain("E.164");
  });

  it("returns a friendly fallback for empty bodies", () => {
    expect(formatVapiCallError("")).toMatch(/voice carrier/i);
  });

  it("surfaces deprecated inputMinCharacters rejections", () => {
    expect(
      formatVapiCallError(
        JSON.stringify({
          message: ["assistant.property inputMinCharacters should not exist"],
        }),
      ),
    ).toMatch(/inputMinCharacters/i);
  });
});
