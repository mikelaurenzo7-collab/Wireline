import { describe, expect, it } from "vitest";
import {
  isEmailConfirmed,
  normalizeVapiToolCalls,
  parseVapiToolArguments,
} from "./vapi-tool-call-utils";

describe("parseVapiToolArguments", () => {
  it("parses JSON string arguments", () => {
    expect(parseVapiToolArguments('{"to_email":"mike@test.com","email_confirmed":true}')).toEqual({
      to_email: "mike@test.com",
      email_confirmed: true,
    });
  });

  it("passes through object arguments", () => {
    expect(parseVapiToolArguments({ to_email: "a@b.co" })).toEqual({ to_email: "a@b.co" });
  });
});

describe("isEmailConfirmed", () => {
  it("accepts boolean and string forms", () => {
    expect(isEmailConfirmed(true)).toBe(true);
    expect(isEmailConfirmed("true")).toBe(true);
    expect(isEmailConfirmed(false)).toBe(false);
    expect(isEmailConfirmed("false")).toBe(false);
  });
});

describe("normalizeVapiToolCalls", () => {
  it("reads toolCallList (current Vapi shape)", () => {
    const calls = normalizeVapiToolCalls({
      type: "tool-calls",
      toolCallList: [
        {
          id: "tc_1",
          name: "send_signup_link",
          arguments: { to_email: "mike@test.com", email_confirmed: true },
        },
      ],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("send_signup_link");
    expect(calls[0].arguments.to_email).toBe("mike@test.com");
  });

  it("reads legacy toolCalls.function shape", () => {
    const calls = normalizeVapiToolCalls({
      type: "tool-calls",
      toolCalls: [
        {
          id: "tc_2",
          function: {
            name: "send_signup_link",
            arguments: '{"to_email":"mike@test.com","email_confirmed":"true"}',
          },
        },
      ],
    });
    expect(calls[0].arguments.email_confirmed).toBe("true");
  });
});
