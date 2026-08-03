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
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const WEBSITE_URL_MAX_CHARS = 2048;

function importSummary(result: { factsAdded: number; rulesAdded: number; truncated: boolean }): string {
  const parts: string[] = [];
  if (result.factsAdded) {
    parts.push(
      `Saved ${result.factsAdded} business fact${result.factsAdded === 1 ? "" : "s"}.`,
    );
  }
  if (result.rulesAdded) {
    parts.push(
      `Saved ${result.rulesAdded} operating rule${result.rulesAdded === 1 ? "" : "s"}.`,
    );
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

    const [agent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
      .limit(1);
    if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");

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
      throw AppError.fromHttpStatus(502, "Wireline could not analyze that website page.");
    }
  },
);

export default router;
