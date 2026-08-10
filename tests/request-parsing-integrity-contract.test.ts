import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { OutboundBulkSchema } from "../src/lib/form-validators";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("validate() writes the parsed request back", () => {
  /**
   * middleware/input-validation.ts called safeParse and discarded the result,
   * so every `.default()`, `.transform()`, and key-strip in a schema used with
   * it was inert at the handler. POST /api/mobile/agents/:id/tools declares
   * `enabled_tools: z.array(z.string()).default([])`, accepts a body that omits
   * it, and then read `undefined.some(...)` — answering 500 on a body its own
   * contract called valid.
   */
  it("assigns the parsed body and merges params and query", () => {
    const middleware = read("src/middleware/input-validation.ts");
    expect(middleware).toContain("req.body = parsedBody");
    // params/query are merged, not reassigned: Express repopulates req.params
    // per routing layer and req.query is a prototype getter.
    expect(middleware).toContain("Object.assign(req.params, parsedParams)");
    expect(middleware).toContain("Object.assign(req.query, parsedQuery)");
  });

  it("writes back only after every schema passed", () => {
    // A partial failure must not leave a half-rewritten request for an error
    // handler (or a later middleware) to read.
    const middleware = read("src/middleware/input-validation.ts");
    const throwIndex = middleware.indexOf('throw AppError.badRequest("Validation failed", errors)');
    expect(throwIndex).toBeGreaterThan(-1);
    expect(middleware.indexOf("req.body = parsedBody")).toBeGreaterThan(throwIndex);
  });

  it("matches the behaviour of both sibling validators", () => {
    // Three validators exist; all three must land parsed output on the request,
    // or which one a route picks silently changes its contract.
    expect(read("src/lib/api-validation-base.ts")).toContain("req.body = result.data");
    expect(read("src/middleware/validate.ts")).toContain("req.body");
  });
});

describe("bulk outbound validates the fields it actually persists", () => {
  /**
   * OutboundLeadSchema is `.passthrough()`, and it declared `phone_number`,
   * `name`, `email`, `notes`, `status` — while the bulk importer persists
   * `agent_id`, `customer_name`, `customer_number`, `context`, `metadata`.
   * Every persisted key was therefore unvalidated, and the importer PREFERS
   * `customer_number` as the dial target, so the phone regex guarded a field
   * the dialler does not use.
   */
  it("applies the dial-number format to the field that gets dialled", () => {
    const oversized = OutboundBulkSchema.safeParse({
      leads: [{ phone_number: "+15551234567", customer_number: "x".repeat(100_000) }],
    });
    expect(oversized.success).toBe(false);

    const malformed = OutboundBulkSchema.safeParse({
      leads: [{ phone_number: "+15551234567", customer_number: "DROP TABLE leads" }],
    });
    expect(malformed.success).toBe(false);
  });

  it("bounds the free-text fields it stores", () => {
    for (const field of ["customer_name", "context"] as const) {
      const parsed = OutboundBulkSchema.safeParse({
        leads: [{ phone_number: "+15551234567", [field]: "x".repeat(50_000) }],
      });
      expect(parsed.success, field).toBe(false);
    }
  });

  it("requires metadata to be an object", () => {
    // The importer spreads it. Spreading a string yields one indexed character
    // per key.
    expect(
      OutboundBulkSchema.safeParse({
        leads: [{ phone_number: "+15551234567", metadata: "abc" }],
      }).success,
    ).toBe(false);
  });

  it("accepts the prefixed agent ids the database actually stores", () => {
    /**
     * `wireline_agents.id` is a TEXT primary key (verified against production)
     * holding `agent-<uuid>` from the create routes and `agent-<hex>` from the
     * draft service. Tightening this field to `.uuid()` rejected every real
     * agent id, so /api/outbound/bulk answered "Invalid agent ID" for any import
     * that assigned an agent — which is the normal case. Before it was declared
     * at all, `.passthrough()` let it by, so the tightening was a regression.
     */
    for (const agentId of [
      `agent-${"a".repeat(8)}-1111-4111-8111-${"b".repeat(12)}`,
      `agent-${"0123456789abcdef".repeat(2)}`,
      "wireline-receptionist",
    ]) {
      const parsed = OutboundBulkSchema.safeParse({
        leads: [{ phone_number: "+15551234567", agent_id: agentId }],
      });
      expect(parsed.success, agentId).toBe(true);
    }

    // Still bounded — the column is text, not unbounded free text.
    expect(
      OutboundBulkSchema.safeParse({
        leads: [{ phone_number: "+15551234567", agent_id: "x".repeat(500) }],
      }).success,
    ).toBe(false);
  });

  it("still lets genuine custom CRM fields through", () => {
    // .passthrough() is deliberate — tightening the persisted keys must not
    // turn this into a closed schema.
    const parsed = OutboundBulkSchema.safeParse({
      leads: [
        {
          phone_number: "+15551234567",
          customer_number: "+15559876543",
          crm_owner: "rep-42",
        },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && (parsed.data.leads[0] as Record<string, unknown>).crm_owner).toBe(
      "rep-42",
    );
  });

  it("cannot have consent metadata spoofed by the caller", () => {
    // The handler spreads caller metadata FIRST and overlays server-derived
    // consent after, so this ordering is what stops a client asserting its own
    // TCPA consent. Guarded here because it is one line away from reversing.
    // The caller spread also passes through stripCallbackRequestMarker: the
    // consent overlay only protects keys it writes, and the callback-request
    // marker is a consent claim it never writes — an imported row carrying it
    // would sail through the overlay and waive consent at dial time.
    const routes = stripComments(read("src/routes/outbound-routes.ts"));
    const spread = routes.indexOf(
      "...stripCallbackRequestMarker((lead.metadata as Record<string, unknown>) || {})",
    );
    const consent = routes.indexOf("...outboundConsentMetadata({", spread);
    expect(spread).toBeGreaterThan(-1);
    expect(consent).toBeGreaterThan(spread);
  });
});

describe("Stripe stale-claim reclaim reaches the handler", () => {
  /**
   * The reclaim branch sets claimed=true intending to fall through and process
   * the event inline, but the catch block ended in an unconditional throw — so
   * it never processed anything. It had already DELETEd and re-INSERTed the
   * row, and processedAt defaults to now(), so each reclaim reset the 5-minute
   * abandonment clock immediately before 503-ing. A paid top-up could be lost.
   */
  it("guards the terminal 503 on !claimed", () => {
    const billing = read("src/routes/billing-routes.ts");
    const claimBlock = billing.slice(
      billing.indexOf("const idempotencyKey = event.id;"),
      billing.indexOf("  try {\n    switch (event.type) {"),
    );
    expect(claimBlock).toContain("claimed = true;");
    // The guard must be bound to THIS throw specifically. An earlier
    // `if (!claimed)` handles duplicates, so a loose search for the nearest one
    // passes even with this guard removed — the first version of this
    // assertion did exactly that and survived the mutation.
    expect(claimBlock).toMatch(
      /if \(!claimed\) \{\s*log\.warn\(\s*"Stripe idempotency claim failed/,
    );
    expect(claimBlock).toContain(
      'throw AppError.fromHttpStatus(503, "Webhook idempotency store unavailable. Retry later.")',
    );
  });
});
