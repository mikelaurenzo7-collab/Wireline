import { describe, expect, it } from "vitest";

import {
  EXPECTED_PRODUCT_URL,
  EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR,
  stripeProductCopyFindings,
} from "../scripts/lib/stripe-product-copy.mjs";

const expectedProducts = [
  {
    key: "starter",
    name: "Wireline Starter",
    description: "One live communications agent with a production number.",
    metadata: {
      wireline_plan_id: "starter",
      included_voice_minutes: "60",
    },
  },
];

function canonicalStarter() {
  return {
    id: "prod_starter",
    active: true,
    name: "Wireline Starter",
    description: "One live communications agent with a production number.",
    url: EXPECTED_PRODUCT_URL,
    statement_descriptor: EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR,
    metadata: {
      wireline_plan_id: "starter",
      included_voice_minutes: "60",
      unrelated_provider_field: "ignored",
    },
  };
}

describe("Stripe product copy parity", () => {
  it("accepts canonical copy, billing presentation, and managed metadata", () => {
    expect(stripeProductCopyFindings([canonicalStarter()], expectedProducts)).toEqual([]);
  });

  it("detects stale AI-agent copy while tolerating whitespace-only differences", () => {
    const stale = stripeProductCopyFindings(
      [
        {
          ...canonicalStarter(),
          description: "One live AI communications agent with a production number.",
        },
      ],
      expectedProducts,
    );
    expect(stale).toEqual([
      expect.objectContaining({
        level: "error",
        message: expect.stringMatching(/description drift/i),
      }),
    ]);

    const whitespaceOnly = stripeProductCopyFindings(
      [
        {
          ...canonicalStarter(),
          description: "  One live communications agent\nwith a production number.  ",
        },
      ],
      expectedProducts,
    );
    expect(whitespaceOnly).toEqual([]);
  });

  it("fails when pricing URL or subscription statement identity drifts", () => {
    const findings = stripeProductCopyFindings(
      [
        {
          ...canonicalStarter(),
          url: "https://cadence.example/pricing",
          statement_descriptor: "TRY WIRELINE",
        },
      ],
      expectedProducts,
    );

    expect(findings).toEqual([
      expect.objectContaining({ level: "error", message: expect.stringMatching(/URL drift/i) }),
      expect.objectContaining({
        level: "error",
        message: expect.stringMatching(/statement descriptor drift/i),
      }),
    ]);
  });

  it("requires Runtime Balance to stay descriptor-free", () => {
    const runtimeBalance = [
      {
        key: "conversation_balance",
        name: "Runtime Balance",
        description: "Prepaid runtime balance.",
        metadata: { wireline_offer: "conversation_balance" },
      },
    ];
    const product = {
      id: "prod_balance",
      active: true,
      name: "Runtime Balance",
      description: "Prepaid runtime balance.",
      url: EXPECTED_PRODUCT_URL,
      statement_descriptor: null,
      metadata: { wireline_offer: "conversation_balance" },
    };

    expect(stripeProductCopyFindings([product], runtimeBalance)).toEqual([]);
    expect(
      stripeProductCopyFindings(
        [{ ...product, statement_descriptor: EXPECTED_SUBSCRIPTION_STATEMENT_DESCRIPTOR }],
        runtimeBalance,
      ),
    ).toEqual([
      expect.objectContaining({
        level: "error",
        message: expect.stringMatching(/statement descriptor drift/i),
      }),
    ]);
  });

  it("detects managed metadata drift without policing unrelated metadata", () => {
    const findings = stripeProductCopyFindings(
      [
        {
          ...canonicalStarter(),
          metadata: {
            wireline_plan_id: "starter",
            included_voice_minutes: "50",
            unrelated_provider_field: "safe",
          },
        },
      ],
      expectedProducts,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        level: "error",
        message: expect.stringMatching(/included_voice_minutes/i),
      }),
    ]);
  });

  it("fails when the canonical product is missing, duplicated, or inactive", () => {
    expect(stripeProductCopyFindings([], expectedProducts)).toEqual([
      expect.objectContaining({ level: "error", metadata: expect.objectContaining({ match_count: 0 }) }),
    ]);

    const duplicate = canonicalStarter();
    expect(
      stripeProductCopyFindings(
        [duplicate, { ...duplicate, id: "prod_starter_b" }],
        expectedProducts,
      ),
    ).toEqual([
      expect.objectContaining({ level: "error", metadata: expect.objectContaining({ match_count: 2 }) }),
    ]);

    expect(
      stripeProductCopyFindings([{ ...duplicate, active: false }], expectedProducts),
    ).toEqual([
      expect.objectContaining({ level: "error", metadata: expect.objectContaining({ match_count: 0 }) }),
    ]);
  });
});
