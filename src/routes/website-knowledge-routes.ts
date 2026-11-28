import { and, eq } from "drizzle-orm";
import { Router, type Response } from "express";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { WebsiteFetchError } from "../lib/safe-public-text-fetch";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { importWebsiteKnowledge } from "../lib/website-knowledge-service";
import { WebsiteKnowledgeExtractionTimeoutError } from "../lib/website-knowledge-timeout";
import { authenticateUser } from "../middleware/auth";
import {
  websiteKnowledgeBurstRateLimit,
  websiteKnowledgeDailyRateLimit,
} from "../middleware/website-knowledge-rate-limits";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { enforcePrivateTextSimulationSpendCap } from "../lib/spend-guards";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const WEBSITE_URL_MAX_CHARS = 2048;
const WEB_LOOKUP_BUSINESS_MAX_CHARS = 600;

async function ownedTrainingTarget(agentId: string, userId: string) {
  const [agent] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  return agent;
}

function importSummary(result: {
  factsAdded: number;
  rulesAdded: number;
  truncated: boolean;
}): string {
  const parts: string[] = [];
  if (result.factsAdded) {
    parts.push(
      `Saved ${result.factsAdded} fact${result.factsAdded === 1 ? "" : "s"} from the page.`,
    );
  }
  if (result.rulesAdded) {
    parts.push(`Saved ${result.rulesAdded} operating rule${result.rulesAdded === 1 ? "" : "s"}.`);
  }
  if (!parts.length) parts.push("No new explicit facts or operating rules were found.");
  if (result.truncated) {
    parts.push("Only the first 28,000 readable characters were analyzed.");
  }
  return parts.join(" ");
}

router.post(
  "/api/agent-config/:id/website",
  authenticateUser,
  websiteKnowledgeBurstRateLimit,
  websiteKnowledgeDailyRateLimit,
  enforceLaunchHardGate,
  async (req: AuthenticatedRequest, res: Response) => {
    const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!rawUrl || rawUrl.length > WEBSITE_URL_MAX_CHARS) {
      throw AppError.fromHttpStatus(400, "Enter a website URL up to 2,048 characters.");
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw AppError.fromHttpStatus(400, "Enter a valid public HTTPS URL.");
    }
    if (parsed.protocol !== "https:") {
      throw AppError.fromHttpStatus(400, "Website imports require an HTTPS URL.");
    }
    if (parsed.port && parsed.port !== "443") {
      throw AppError.fromHttpStatus(400, "Website imports use the standard HTTPS port.");
    }
    if (parsed.username || parsed.password) {
      throw AppError.fromHttpStatus(400, "Website URLs must not contain credentials.");
    }

    if (!(await ownedTrainingTarget(req.params.id, req.user.id)))
      throw AppError.fromHttpStatus(404, "Bot not found");

    try {
      const result = await importWebsiteKnowledge({
        agentId: req.params.id,
        userId: req.user.id,
        url: parsed.toString(),
      });
      log.info("Website knowledge imported", {
        userId: req.user.id,
        agentId: req.params.id,
        hostname: new URL(result.sourceUrl).hostname,
        factsAdded: result.factsAdded,
        rulesAdded: result.rulesAdded,
        truncated: result.truncated,
      });
      res.json({
        success: true,
        summary: importSummary(result),
        sourceUrl: result.sourceUrl,
        pageTitle: result.pageTitle,
        factsAdded: result.factsAdded,
        rulesAdded: result.rulesAdded,
        toneUpdated: false,
        truncated: result.truncated,
      });
    } catch (error) {
      if (error instanceof WebsiteFetchError) {
        throw AppError.fromHttpStatus(error.httpStatus, error.message);
      }
      if (error instanceof WebsiteKnowledgeExtractionTimeoutError) {
        throw AppError.fromHttpStatus(504, error.message);
      }
      if (error instanceof AppError) throw error;
      log.error("Website knowledge import failed", {
        userId: req.user.id,
        agentId: req.params.id,
        hostname: parsed.hostname,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(502, "BotBound could not analyze that website page.");
    }
  },
);

/**
 * A Bot getting to know a business that has no website: look it up on the
 * public web and return what was found. Nothing is saved here. The owner sees
 * the answer and its sources, and only "Yes, that's us" sends it to Knowledge
 * through the training extractor. The owner's own words name the business;
 * the server writes the research question.
 */
router.post(
  "/api/agent-config/:id/web-lookup",
  authenticateUser,
  websiteKnowledgeBurstRateLimit,
  websiteKnowledgeDailyRateLimit,
  enforceLaunchHardGate,
  enforcePrivateTextSimulationSpendCap,
  async (req: AuthenticatedRequest, res: Response) => {
    const business =
      typeof req.body?.business === "string" ? req.body.business.replace(/\s+/g, " ").trim() : "";
    if (!business || business.length > WEB_LOOKUP_BUSINESS_MAX_CHARS) {
      throw AppError.fromHttpStatus(400, "Describe the business in up to 600 characters.");
    }
    if (!(await ownedTrainingTarget(req.params.id, req.user.id)))
      throw AppError.fromHttpStatus(404, "Bot not found");

    const { freshPublicResearch } = await import("../lib/fresh-public-research");
    const result = await freshPublicResearch(
      `Public information about this business: "${business}". List its services, hours, service area, phone number, and prices if published. If you cannot find this exact business, say so.`,
    );
    const found = result.mode !== "unavailable" && Boolean(result.answer.trim());
    log.info("Business web lookup", {
      userId: req.user.id,
      agentId: req.params.id,
      found,
      sources: result.sources.length,
    });
    res.json({
      found,
      answer: found ? result.answer : "",
      sources: found ? result.sources : [],
    });
  },
);

export default router;
