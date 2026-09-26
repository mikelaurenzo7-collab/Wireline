import { describe, expect, it } from "vitest";
import {
  readTwilioPrepaidBalanceUsd,
  twilioFundingBlocker,
} from "../scripts/lib/twilio-funding-readiness.mjs";

describe("Twilio funding readiness", () => {
  it.each([0.01, 20, 50, 51.764, 149.99, 150])(
    "accepts a verified positive balance of %s without a fixed reserve",
    (balance) => {
      expect(
        twilioFundingBlocker(
          readTwilioPrepaidBalanceUsd({
            balance: balance.toString(),
            currency: "USD",
          }),
        ),
      ).toBeNull();
    },
  );

  it.each([0, -0.01, -50])("blocks a depleted balance of %s", (balance) => {
    expect(twilioFundingBlocker(readTwilioPrepaidBalanceUsd({ balance, currency: "USD" }))).toBe(
      "twilio_prepaid_balance_not_positive",
    );
  });

  it.each([undefined, null, "", " ", "bad", "0x32", true, {}, [], Infinity, NaN])(
    "keeps malformed balance %j unknown",
    (balance) => {
      expect(readTwilioPrepaidBalanceUsd({ balance, currency: "USD" })).toBeNull();
      expect(twilioFundingBlocker(readTwilioPrepaidBalanceUsd({ balance, currency: "USD" }))).toBe(
        "twilio_prepaid_balance_unknown",
      );
    },
  );

  it.each([undefined, null, 1, "EUR"])("does not assume currency %j is USD", (currency) => {
    expect(readTwilioPrepaidBalanceUsd({ balance: "50.00", currency })).toBeNull();
  });

  it.each([undefined, null, NaN, Infinity, "50"])(
    "does not pass unreadable funding %j",
    (balance) => {
      expect(twilioFundingBlocker(balance)).toBe("twilio_prepaid_balance_unknown");
    },
  );
});
