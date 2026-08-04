import { describe, expect, it } from "vitest";

import { stripeProductCopyFindings } from "../scripts/lib/stripe-product-copy.mjs";

const expectedProducts = [
  {
    name: "Wireline Starter",
    description: "One live communications agent with a production number.",
    metadata: {
      wireline_plan_id: "starter",
      included_voice_minutes: "60",
    },
  },
];

describe("Stripe product copy parity", () => {
  it("accepts canonical copy and managed metadata", () => {
    const findings = stripeProductCopyFindings(
      [
        {
          id: "prod_starter",
          active: true,
          name: "Wireline Starter",
          description: "One live communications agent with a production number.",
          metadata: {
            wireline_plan_id: "starter",
            included_voice_minutes: "60",
            unrelated_provider_field: "ignored",
          },
        },
      ],
      expectedProducts,
    );

    expect(findings).toEqual([]);
  });

  it("detects stale AI-agent copy while tolerating whitespace-only differences", () => {
    const stale = stripeProductCopyFindings(
      [
        {
          id: "prod_starter",
          active: true,
          name: "Wireline Starter",
          description: "One live AI communications agent with a production number.",
          metadata: {
            wireline_plan_id: "starter",
            included_voice_minutes: "60",
          },
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
          id: "prod_starter",
          active: true,
          name: "Wireline Starter",
          description: "  One live communications agent\nwith a production number.  ",
          metadata: {
            wireline_plan_id: "starter",
            included_voice_minutes: "60",
          },
        },
      ],
      expectedProducts,
    );
    expect(whitespaceOnly).toEqual([]);
  });

  it("detects managed metadata drift without policing unrelated metadata", () => {
    const findings = stripeProductCopyFindings(
      [
        {
          id: "prod_starter",
          active: true,
          name: "Wireline Starter",
          description: "One live communications agent with a production number.",
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

    const duplicate = {
      id: "prod_starter_a",
      active: true,
      name: "Wireline Starter",
      description: expectedProducts[0].description,
      metadata: expectedProducts[0].metadata,
    };
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
