import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizeE164Phone,
  generateLeadId,
  processRawListings,
  globalLeadStore,
  type RawLeadListing,
} from "../src/lib/lead-hunter/lead-scraper";
import {
  buildLeadDossier,
  isWithinPermittedCallingHours,
  prepareLeadDial,
} from "../src/lib/lead-hunter/lead-dialer";
import { processLeadCallAction } from "../src/lib/lead-hunter/lead-action-bridge";
import type { DiscoveredLead } from "../src/lib/lead-hunter/types";

describe("Horizon 2: Outbound Lead Engine (Browser-to-Voice Pipeline)", () => {
  beforeEach(() => {
    globalLeadStore.clear();
  });

  describe("Surface 1: Phone Normalization & Lead Extraction", () => {
    it("normalizes standard 10-digit US phone numbers to E.164", () => {
      expect(normalizeE164Phone("2145550199")).toBe("+12145550199");
      expect(normalizeE164Phone("(214) 555-0199")).toBe("+12145550199");
      expect(normalizeE164Phone("214.555.0199")).toBe("+12145550199");
    });

    it("normalizes 11-digit US numbers with leading 1", () => {
      expect(normalizeE164Phone("1-214-555-0199")).toBe("+12145550199");
      expect(normalizeE164Phone("+1 (214) 555-0199")).toBe("+12145550199");
    });

    it("rejects invalid or incomplete phone numbers", () => {
      expect(normalizeE164Phone("12345")).toBeNull();
      expect(normalizeE164Phone("no-phone-here")).toBeNull();
      expect(normalizeE164Phone("")).toBeNull();
    });

    it("generates deterministic lead IDs from business name and phone", () => {
      const id1 = generateLeadId("Apex Plumbing", "+12145550199");
      const id2 = generateLeadId("Apex Plumbing", "+12145550199");
      const id3 = generateLeadId("Apex Plumbing LLC", "+12145550199");

      expect(id1).toBe(id2);
      expect(id1).not.toBe(id3);
      expect(id1.startsWith("lead_")).toBe(true);
    });

    it("processes and deduplicates raw scraped listings", () => {
      const raw: RawLeadListing[] = [
        {
          title: "Dallas Pro HVAC",
          phone: "(214) 555-1111",
          website: "https://dallasprohvac.com",
          address: "100 Main St, Dallas, TX",
          rating: 4.8,
          reviews: 54,
          category: "hvac",
        },
        {
          title: "Dallas Pro HVAC (Duplicate Listing)",
          phone: "214.555.1111", // duplicate phone
          category: "hvac",
        },
        {
          title: "Low Rated Contractor",
          phone: "214-555-2222",
          rating: 2.5,
          reviews: 4,
          category: "hvac",
        },
        {
          title: "Missing Phone Co",
          website: "https://nophone.com",
        },
      ];

      const qualified = processRawListings(raw, "hvac", 3.5);
      expect(qualified.length).toBe(1);
      expect(qualified[0].businessName).toBe("Dallas Pro HVAC");
      expect(qualified[0].phoneNumber).toBe("+12145551111");
      expect(qualified[0].tradeCategory).toBe("hvac");
    });
  });

  describe("Surface 2: Lead Store Management", () => {
    it("adds and retrieves discovered leads without duplicates", () => {
      const leads = processRawListings([
        { title: "Lonestar Electric", phone: "2145553333", category: "electrical" },
        { title: "Texan Roofing", phone: "2145554444", category: "roofing" },
      ]);

      const added = globalLeadStore.addLeads(leads);
      expect(added.length).toBe(2);

      const dupAdded = globalLeadStore.addLeads(leads);
      expect(dupAdded.length).toBe(0);

      const fetched = globalLeadStore.getLead(leads[0].id);
      expect(fetched?.businessName).toBe("Lonestar Electric");
    });

    it("filters leads by category and status", () => {
      const leads = processRawListings([
        { title: "Lonestar Electric", phone: "2145553333", category: "electrical" },
        { title: "Texan Roofing", phone: "2145554444", category: "roofing" },
      ]);
      globalLeadStore.addLeads(leads);

      expect(globalLeadStore.listLeads({ category: "electrical" }).length).toBe(1);
      expect(globalLeadStore.listLeads({ category: "plumbing" }).length).toBe(0);

      globalLeadStore.updateLeadStatus(leads[0].id, "qualified");
      expect(globalLeadStore.listLeads({ status: "qualified" }).length).toBe(1);
      expect(globalLeadStore.listLeads({ status: "discovered" }).length).toBe(1);
    });
  });

  describe("Surface 3: Outbound Dossier & TCPA Calling Compliance", () => {
    const sampleLead: DiscoveredLead = {
      id: "lead_sample_1",
      businessName: "DFW Rapid HVAC",
      phoneNumber: "+12145559876",
      website: "https://dfwrapidhvac.com",
      address: "500 Elm St, Dallas, TX",
      rating: 4.9,
      reviewCount: 112,
      tradeCategory: "hvac",
      discoveredAt: new Date(),
      status: "discovered",
    };

    it("builds a contextual briefing dossier for Gemini Live voice worker", () => {
      const dossier = buildLeadDossier(sampleLead);
      expect(dossier.businessName).toBe("DFW Rapid HVAC");
      expect(dossier.phoneNumber).toBe("+12145559876");
      expect(dossier.suggestedOpeningHook).toContain("DFW Rapid HVAC");
      expect(dossier.suggestedOpeningHook).toContain("hvac listing");
      expect(dossier.promptSystemPromptAddition).toContain("DFW Rapid HVAC");
      expect(dossier.promptSystemPromptAddition).toContain("rated 4.9 stars");
      expect(dossier.promptSystemPromptAddition).toContain("https://dfwrapidhvac.com");
    });

    it("enforces TCPA 8am - 9pm calling hours in target timezone", () => {
      const daytime = new Date("2026-10-29T19:00:00Z"); // 2:00 PM CDT
      expect(isWithinPermittedCallingHours(daytime, "America/Chicago")).toBe(true);

      const midnight = new Date("2026-10-29T06:00:00Z"); // 1:00 AM CDT
      expect(isWithinPermittedCallingHours(midnight, "America/Chicago")).toBe(false);
    });

    it("approves qualified lead for dialing during permitted hours", () => {
      const daytime = new Date("2026-10-29T19:00:00Z");
      const check = prepareLeadDial(sampleLead, {
        userId: "user-123",
        agentId: "agent-sales-1",
        now: daytime,
        recipientTimeZone: "America/Chicago",
      });

      expect(check.approved).toBe(true);
      expect(check.dossier?.businessName).toBe("DFW Rapid HVAC");
    });

    it("refuses dialing if lead is marked DO NOT CALL", () => {
      const dncLead: DiscoveredLead = { ...sampleLead, status: "do_not_call" };
      const check = prepareLeadDial(dncLead, {
        userId: "user-123",
        agentId: "agent-sales-1",
      });

      expect(check.approved).toBe(false);
      expect(check.rejectionReason).toContain("DO NOT CALL");
    });

    it("refuses dialing outside TCPA calling hours", () => {
      const lateNight = new Date("2026-10-29T04:30:00Z"); // 11:30 PM CDT
      const check = prepareLeadDial(sampleLead, {
        userId: "user-123",
        agentId: "agent-sales-1",
        now: lateNight,
        recipientTimeZone: "America/Chicago",
      });

      expect(check.approved).toBe(false);
      expect(check.rejectionReason).toContain("Outside permitted TCPA calling hours");
    });
  });

  describe("Surface 4: In-Call Action Fulfillment", () => {
    it("books appointment, creates 5-min soft hold, computes travel buffer, and emits .ics", () => {
      const lead = processRawListings([
        { title: "Metro Plumbing", phone: "2145558888", address: "123 Oak St, Dallas, TX" },
      ])[0];
      globalLeadStore.addLeads([lead]);

      const appointmentTime = new Date("2026-11-02T15:00:00Z");
      const result = processLeadCallAction(
        {
          leadId: lead.id,
          callSid: "CA_test_call_1",
          outcome: "booked_appointment",
          appointmentTime,
          serviceAddress: "123 Oak St, Dallas, TX",
          notes: "Need estimate on water heater replacement",
          recordedAt: new Date(),
        },
        {
          userId: "user-1",
          agentId: "agent-1",
          technicianBaseAddress: "HQ Office, Dallas, TX",
        }
      );

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("booked_appointment");
      expect(result.hold?.status).toBe("active");
      expect(result.hold?.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(result.icsContent).toContain("BEGIN:VCALENDAR");
      expect(result.icsContent).toContain("Consultation: Metro Plumbing");
      expect(result.details.travelBufferMinutes).toBeGreaterThanOrEqual(15);
      expect(globalLeadStore.getLead(lead.id)?.status).toBe("qualified");
    });

    it("generates mid-call text-to-pay deposit link with Apple/Google Pay", () => {
      const lead = processRawListings([
        { title: "Speedy Electric", phone: "2145557777" },
      ])[0];
      globalLeadStore.addLeads([lead]);

      const result = processLeadCallAction(
        {
          leadId: lead.id,
          callSid: "CA_test_call_2",
          outcome: "sent_deposit_link",
          depositAmountCents: 7500, // $75.00
          recordedAt: new Date(),
        },
        {
          userId: "user-1",
          agentId: "agent-1",
        }
      );

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("sent_deposit_link");
      expect(result.paymentUrl).toContain("checkout.stripe.com");
      expect(result.paymentUrl).toContain("wallets=apple_pay,google_pay");
      expect(result.paymentUrl).toContain("amount=7500");
      expect(globalLeadStore.getLead(lead.id)?.status).toBe("qualified");
    });

    it("marks lead as DO NOT CALL when customer expresses no interest", () => {
      const lead = processRawListings([
        { title: "Not Interested LLC", phone: "2145556666" },
      ])[0];
      globalLeadStore.addLeads([lead]);

      const result = processLeadCallAction(
        {
          leadId: lead.id,
          callSid: "CA_test_call_3",
          outcome: "not_interested",
          notes: "Told us not to call back",
          recordedAt: new Date(),
        },
        {
          userId: "user-1",
          agentId: "agent-1",
        }
      );

      expect(result.success).toBe(true);
      expect(result.actionTaken).toBe("marked_do_not_call");
      expect(globalLeadStore.getLead(lead.id)?.status).toBe("do_not_call");
    });
  });
});
