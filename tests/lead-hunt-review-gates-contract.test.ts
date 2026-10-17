import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CampaignCreateSchema, CampaignUpdateSchema } from "../src/lib/form-validators";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Lead Hunt review and launch boundaries", () => {
  it("validates malformed Lead Hunt IDs without calling BigInt on untrusted text", () => {
    const routes = source("src/routes/outbound-routes.ts");
    const idSchema = routes.slice(
      routes.indexOf("const LeadHuntIdSchema"),
      routes.indexOf("const LeadHuntApprovalSchema"),
    );

    expect(idSchema).toContain("parseBigIntId(value)");
    expect(idSchema).toContain("parsed === null || parsed <= POSTGRES_BIGINT_MAX");
    expect(idSchema).not.toContain("BigInt(value)");
  });

  it("accepts the text Bot IDs used by campaign assignment", () => {
    const agentId = "agent-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(CampaignCreateSchema.safeParse({ name: "Lead Hunt", agent_id: agentId }).success).toBe(
      true,
    );
    expect(CampaignUpdateSchema.safeParse({ agent_id: "founder-prospector" }).success).toBe(true);
    expect(
      CampaignCreateSchema.safeParse({ name: "Lead Hunt", agent_id: "x".repeat(129) }).success,
    ).toBe(false);
  });

  it("stages Apollo results for review instead of dialing or assigning them", () => {
    const worker = source("src/lib/job-worker-base.ts");
    const prospecting = worker.slice(
      worker.indexOf('job.type === "autonomous_prospecting"'),
      worker.indexOf('job.type === "knowledge_from_url"'),
    );

    expect(prospecting).toContain('source: "apollo"');
    expect(prospecting).toContain("status: LEAD_STATUS.PENDING");
    expect(prospecting).toContain('review_status: "pending"');
    expect(prospecting).toContain("has_express_written_consent: false");
    expect(prospecting).not.toContain("campaign_dial");
  });

  it("keeps only the newest Lead Hunt review-list response", () => {
    const review = source("src/components/outbound/LeadHuntReview.tsx");
    const loader = review.slice(
      review.indexOf("const loadLeads = useCallback("),
      review.indexOf("useEffect(() =>", review.indexOf("const loadLeads = useCallback(")),
    );
    expect(loader).toContain("leadListAbortRef.current?.abort()");
    expect(loader).toContain("leadListOperationRef.current === operation");
    expect(loader).toContain("signal: controller.signal");
    expect(loader).toContain("if (!isCurrentRequest()) return;");
    expect(loader).toContain("if (isCurrentRequest()) setLoading(false);");
  });

  it("labels every Lead Hunt targeting control and exposes company-size state", () => {
    const growth = source("src/components/admin/GrowthPanel.tsx");
    expect(growth).toContain('htmlFor="growth-target-titles"');
    expect(growth).toContain('htmlFor="growth-target-industries"');
    expect(growth).toContain('htmlFor="growth-target-geography"');
    expect(growth).toContain('aria-label="Add job title"');
    expect(growth).toContain('aria-label="Add industry"');
    expect(growth).toContain('aria-label="Add geographic target"');
    expect(growth).toContain('aria-labelledby="growth-target-company-size"');
    expect(growth).toContain("aria-pressed={targetEmployeeRanges.includes(range.value)}");
  });

  it("binds queued Lead Hunt work to the immutable job owner", () => {
    const worker = source("src/lib/job-worker-base.ts");
    const prospecting = worker.slice(
      worker.indexOf('job.type === "autonomous_prospecting"'),
      worker.indexOf('job.type === "knowledge_from_url"'),
    );

    expect(prospecting).toContain("const userId = assertJobPayloadOwner(job, p)");
    expect(worker).toContain('import { assertJobPayloadOwner } from "./job-owner"');
    expect(prospecting).not.toContain("const userId = job.user_id");
    expect(prospecting).toContain("eq(schema.settings.userId, userId)");
    expect(prospecting).not.toContain("eq(schema.settings.userId, p.userId)");
  });

  it("checks the authoritative spend guard before Lead Hunt enqueue", () => {
    const routes = source("src/routes/job-routes.ts");
    const prospectRoute = routes.slice(
      routes.indexOf('"/prospect"'),
      routes.indexOf("router.get(", routes.indexOf('"/prospect"')),
    );

    expect(prospectRoute).toContain("authenticateUser");
    expect(prospectRoute).toContain("jobsRateLimit");
    expect(prospectRoute).toContain("enforceSpendCap");
    expect(prospectRoute.indexOf("enforceSpendCap")).toBeLessThan(
      prospectRoute.indexOf("await enqueue("),
    );
  });

  it("requires explicit review and tenant-owned draft campaign assignment", () => {
    const routes = source("src/routes/outbound-routes.ts");
    const approval = routes.slice(
      routes.indexOf('"/api/lead-hunt/approve"'),
      routes.indexOf('router.get("/api/outbound"'),
    );

    expect(routes).toContain("review_approved: z.literal(true)");
    expect(approval).toContain("eq(schema.outboundCampaigns.userId, req.user.id)");
    expect(approval).toContain("eq(schema.agents.userId, req.user.id)");
    expect(approval).toContain('campaign.status !== "draft"');
    expect(approval).toContain('eq(schema.outboundLeads.source, "apollo")');
    expect(approval).toContain("isNull(schema.outboundLeads.campaignId)");
    expect(approval).toContain("isNotNull(schema.outboundLeads.customerNumber)");
    expect(approval).toContain("status: LEAD_STATUS.QUEUED");
    expect(approval).toContain("campaign.agentId && campaign.agentId !== agent_id");
    expect(approval).toContain("isNull(schema.outboundCampaigns.agentId)");
    expect(approval).not.toContain("campaign_dial");
  });

  it("only rejects Apollo leads that are still waiting for review", () => {
    const routes = source("src/routes/outbound-routes.ts");
    const rejection = routes.slice(
      routes.indexOf('"/api/lead-hunt/leads/:id"'),
      routes.indexOf('"/api/lead-hunt/approve"'),
    );

    expect(rejection).toContain("eq(schema.outboundLeads.userId, req.user.id)");
    expect(rejection).toContain('eq(schema.outboundLeads.source, "apollo")');
    expect(rejection).toContain("isNull(schema.outboundLeads.campaignId)");
    expect(rejection).toContain("LEAD_HUNT_RESULT_CHANGED");
  });

  it("keeps campaign launch as a separate approval and compliance-gated action", () => {
    const campaignRoutes = source("src/routes/campaign-routes.ts");
    const launch = campaignRoutes.slice(
      campaignRoutes.indexOf('"/api/campaigns/:id/launch"'),
      campaignRoutes.indexOf('"/api/campaigns/:id/retry-failed"'),
    );

    expect(launch).toContain('outboundVoiceGuard("campaign")');
    expect(launch).toContain("launch_approval_confirmed");
    expect(launch).toContain("assertFederalDncForMarketing()");
    expect(launch).toContain('type: "campaign_dial"');
  });
});
