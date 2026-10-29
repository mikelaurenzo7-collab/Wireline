import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authenticateUser } from "../middleware/auth";
import { validate } from "../middleware/input-validation";
import { AppError } from "../lib/api-error";
import {
  processRawListings,
  globalLeadStore,
  type RawLeadListing,
} from "../lib/lead-hunter/lead-scraper";
import { prepareLeadDial } from "../lib/lead-hunter/lead-dialer";
import { processLeadCallAction } from "../lib/lead-hunter/lead-action-bridge";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

const discoverSchema = z.object({
  listings: z.array(
    z.object({
      title: z.string(),
      phone: z.string().optional(),
      website: z.string().optional(),
      address: z.string().optional(),
      rating: z.number().optional(),
      reviews: z.number().optional(),
      category: z.string().optional(),
    }),
  ),
  category: z.string().optional(),
  minRating: z.number().optional(),
});

const dialSchema = z.object({
  leadId: z.string(),
  agentId: z.string(),
  callPurpose: z.enum(["appointment_service", "existing_customer", "sales", "callback"]).default("sales"),
  recipientTimeZone: z.string().optional(),
});

const actionSchema = z.object({
  leadId: z.string(),
  callSid: z.string(),
  outcome: z.enum([
    "booked_appointment",
    "sent_deposit_link",
    "sent_email_quote",
    "callback_requested",
    "not_interested",
  ]),
  appointmentTime: z.string().optional(),
  serviceAddress: z.string().optional(),
  depositAmountCents: z.number().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/lead-hunter/discover
 * Ingests scraped listings from browser automation into qualified leads
 */
router.post(
  "/api/lead-hunter/discover",
  authenticateUser,
  validate(discoverSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { listings, category, minRating } = req.body;
    const qualified = processRawListings(listings as RawLeadListing[], category, minRating);
    const added = globalLeadStore.addLeads(qualified);

    res.json({
      success: true,
      totalExtracted: listings.length,
      qualifiedCount: qualified.length,
      newLeadsAdded: added.length,
      leads: qualified,
    });
  },
);

/**
 * POST /api/lead-hunter/dial
 * Validates TCPA calling compliance and builds the contextual dossier for the voice worker
 */
router.post(
  "/api/lead-hunter/dial",
  authenticateUser,
  validate(dialSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { leadId, agentId, callPurpose, recipientTimeZone } = req.body;
    const lead = globalLeadStore.getLead(leadId);

    if (!lead) {
      throw AppError.fromHttpStatus(404, "Lead not found in store.");
    }

    const check = prepareLeadDial(lead, {
      userId: req.user.id,
      agentId,
      callPurpose,
      recipientTimeZone,
    });

    if (!check.approved || !check.dossier) {
      return res.status(403).json({
        success: false,
        rejectionReason: check.rejectionReason,
      });
    }

    globalLeadStore.updateLeadStatus(lead.id, "screened");

    res.json({
      success: true,
      readyToDial: true,
      dossier: check.dossier,
    });
  },
);

/**
 * POST /api/lead-hunter/action
 * Executes post-call or mid-call settlement, calendar hold, or email dispatch
 */
router.post(
  "/api/lead-hunter/action",
  authenticateUser,
  validate(actionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { leadId, callSid, outcome, appointmentTime, serviceAddress, depositAmountCents, notes } = req.body;

    const result = processLeadCallAction(
      {
        leadId,
        callSid,
        outcome,
        appointmentTime: appointmentTime ? new Date(appointmentTime) : undefined,
        serviceAddress,
        depositAmountCents,
        notes,
        recordedAt: new Date(),
      },
      {
        userId: req.user.id,
        agentId: req.body.agentId || "agent-default",
      },
    );

    res.json({
      success: result.success,
      actionTaken: result.actionTaken,
      details: result.details,
      paymentUrl: result.paymentUrl,
      holdId: result.hold?.holdId,
    });
  },
);

/**
 * GET /api/lead-hunter/leads
 * Lists leads currently discovered in the hunter workspace
 */
router.get("/api/lead-hunter/leads", authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const category = req.query.category as string | undefined;
  const status = req.query.status as any;
  const leads = globalLeadStore.listLeads({ category, status });
  res.json({ success: true, count: leads.length, leads });
});

export default router;
